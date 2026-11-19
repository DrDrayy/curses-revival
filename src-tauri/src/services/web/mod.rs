use local_ip_address::local_ip;
use serde::{Deserialize, Serialize};
use std::{
    net::{Ipv4Addr, Ipv6Addr},
    process::Command,
    sync::Arc,
};
use tauri::{
    async_runtime::Mutex,
    command,
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, State,
};
use tokio::sync::mpsc;
use warp::{Filter, Reply};

use super::AppConfiguration;

mod assets;
mod peer;
mod pubsub;

/// Origin check for the websocket upgrades (`/pubsub` and `/peer`).
///
/// The server listens on 0.0.0.0 (the overlay can be loaded from the LAN address of this PC), so
/// a web page the user opens could connect to it. Browsers always send the Origin header on a
/// websocket upgrade and a page can't change it, so only these are accepted:
/// - no Origin (not a browser);
/// - the app itself: `tauri://localhost`, `http(s)://tauri.localhost`;
/// - pages loaded from `localhost` or from a local network address (loopback, private,
///   link-local). Public IPs and domain names (also DNS rebinding) are refused.
pub(super) fn origin_allowed(origin: Option<&str>) -> bool {
    let Some(origin) = origin else {
        return true;
    };
    let origin = origin.trim().to_ascii_lowercase();
    if origin == "tauri://localhost" {
        return true;
    }
    let Some((scheme, authority)) = origin.split_once("://") else {
        return false;
    };
    if scheme != "http" && scheme != "https" {
        return false;
    }

    // authority = host[:port] or [ipv6][:port]
    let (host, port, bracketed) = if let Some(inner) = authority.strip_prefix('[') {
        let Some((host, rest)) = inner.split_once(']') else {
            return false;
        };
        let port = if rest.is_empty() {
            None
        } else if let Some(port) = rest.strip_prefix(':') {
            Some(port)
        } else {
            return false;
        };
        (host, port, true)
    } else {
        match authority.rsplit_once(':') {
            Some((host, port)) => (host, Some(port), false),
            None => (authority, None, false),
        }
    };
    if let Some(port) = port {
        if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) || port.parse::<u16>().is_err() {
            return false;
        }
    }

    if bracketed {
        let Ok(ip) = host.parse::<Ipv6Addr>() else {
            return false;
        };
        let first = ip.segments()[0];
        return ip.is_loopback()
            || (first & 0xfe00) == 0xfc00 // unique local fc00::/7
            || (first & 0xffc0) == 0xfe80; // link-local fe80::/10
    }
    if host == "localhost" {
        return true;
    }
    if host == "tauri.localhost" {
        return port.is_none();
    }
    // a PC's network name without a dot ("gaming-pc") or an mDNS ".local" name only works inside the
    // local network; dotted names that aren't IPs are public domains and stay refused
    if !host.is_empty() && host.parse::<Ipv4Addr>().is_err() && (!host.contains('.') || host.ends_with(".local")) {
        return true;
    }
    match host.parse::<Ipv4Addr>() {
        // 100.64.0.0/10 is carrier-grade NAT / Tailscale, also never a public web page
        Ok(ip) => ip.is_loopback() || ip.is_private() || ip.is_link_local()
            || (ip.octets()[0] == 100 && (ip.octets()[1] & 0xc0) == 64),
        Err(_) => false,
    }
}

/// Extracts whether the websocket upgrade comes from an allowed Origin (see `origin_allowed`).
pub(super) fn ws_origin_allowed() -> impl Filter<Extract = (bool,), Error = warp::Rejection> + Clone {
    warp::header::optional::<String>("origin").map(|origin: Option<String>| origin_allowed(origin.as_deref()))
}

/// Answer for an upgrade that comes from a forbidden Origin.
pub(super) fn forbidden_origin() -> warp::reply::Response {
    warp::reply::with_status("Forbidden origin", warp::http::StatusCode::FORBIDDEN).into_response()
}

struct PubSubInput {
    tx: Mutex<mpsc::Sender<String>>,
}

#[command]
async fn pubsub_broadcast(value: String, input: State<'_, PubSubInput>) -> Result<(), String> {
    let tx = input.tx.lock().await;
    tx.send(value).await.map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct WebConfig {
    pub local_ip: String,
    pub port: String,
    pub peer_path: String,
    pub pubsub_path: String,
}

#[command]
async fn config(config: State<'_, AppConfiguration>) -> Result<WebConfig, String> {
    // no network: fall back to loopback so the app can still start
    let ip = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string());
    return Ok(WebConfig {
        local_ip: ip,
        port: config.port.to_string(),
        peer_path: "peer".to_string(),
        pubsub_path: "pubsub".to_string(),
    });
}

#[derive(Serialize, Deserialize)]
struct OpenBrowserCommand {
    browser: String,
    url: String,
    /// open the page as an app window (`--app=<url>`, no tabs or address bar); false when not sent
    #[serde(default)]
    app: bool,
}

/// The url is put on a `cmd /C start` command line: only plain http(s) addresses without
/// spaces or cmd special characters are allowed.
fn is_safe_browser_url(url: &str) -> bool {
    (url.starts_with("http://") || url.starts_with("https://"))
        && !url.chars().any(|c| c.is_whitespace() || c.is_control() || "&|<>^\"%!()`;".contains(c))
}

#[command]
fn open_browser(data: OpenBrowserCommand) {
    // the app only opens these two browsers
    if !matches!(data.browser.as_str(), "chrome" | "msedge") || !is_safe_browser_url(&data.url) {
        eprintln!("open_browser: refused");
        return;
    }
    if cfg!(target_os = "windows") {
        let target = if data.app { format!("--app={}", &data.url) } else { data.url.clone() };
        Command::new("cmd")
            .args(&["/C", format!("start {} {}", &data.browser, &target).as_str()])
            .output()
            .ok();
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let (pubsub_input_tx, pubsub_input_rx) = mpsc::channel::<String>(1); // to pubsub
    let (pubsub_output_tx, mut pubsub_output_rx) = mpsc::channel::<String>(1); // to js
    Builder::new("web")
        .invoke_handler(tauri::generate_handler![open_browser, pubsub_broadcast, config])
        .setup(|app| {
            app.manage(PubSubInput {
                tx: Mutex::new(pubsub_input_tx),
            });

            let app_port = app.state::<AppConfiguration>().port;

            let a = Arc::new(app.asset_resolver());
            tauri::async_runtime::spawn(async move {
                let routes = warp::path!("ping")
                    .map(|| format!("pong"))
                    .or(peer::path())
                    .or(pubsub::path(pubsub_input_rx, pubsub_output_tx))
                    .or(assets::path(a));

                // run() panics when the port can't be bound, so use try_bind: log the error and stop
                match warp::serve(routes).try_bind_ephemeral(([0, 0, 0, 0], app_port)) {
                    Ok((_addr, server)) => server.await,
                    Err(err) => {
                        eprintln!("web: unable to start the server on port {}: {}", app_port, err);
                        crate::services::log::log_error(&format!("web: unable to start the server on port {}: {}", app_port, err));
                    }
                }
            });
            let handle = app.app_handle();
            tauri::async_runtime::spawn(async move {
                while let Some(output) = pubsub_output_rx.recv().await {
                    if let Err(err) = handle.emit_all("pubsub", output) {
                        eprintln!("web: unable to send the message to the app: {}", err);
                        crate::services::log::log_error(&format!("web: unable to send the message to the app: {}", err));
                    }
                }
            });

            Ok(())
        })
        .build()
}
