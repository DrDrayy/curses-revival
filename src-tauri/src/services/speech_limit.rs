use serde::Serialize;
use std::fs;
use tauri::{
    command,
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};

/// Microsoft's free speech recognition in the app window ("Native") has a daily limit for each
/// WebView2 data folder. WebView2 keeps the count in the folder's "Local State" file; this only
/// reads it, it never writes to it.
#[derive(Serialize)]
struct SpeechLimit {
    /// seconds of speech counted so far
    used_seconds: f64,
    /// the counter's time mark ("last_checkpoint"), in milliseconds since 1970-01-01 UTC
    checkpoint_ms: Option<f64>,
}

/// numbers in that file can be JSON numbers or strings (big integers)
fn number(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// None when there is no count yet (Native never used, or the file can't be read)
#[command]
fn usage<R: Runtime>(app: AppHandle<R>) -> Option<SpeechLimit> {
    let path = app
        .path_resolver()
        .app_local_data_dir()?
        .join("EBWebView")
        .join("Local State");
    let text = fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let limiter = json.get("speech_recognition_limiter")?;
    let used_seconds = limiter.get("amount_used").and_then(number)?;
    // microseconds since 1601-01-01 UTC -> milliseconds since 1970-01-01 UTC
    let checkpoint_ms = limiter
        .get("last_checkpoint")
        .and_then(number)
        .map(|us| us / 1000.0 - 11_644_473_600_000.0);
    Some(SpeechLimit {
        used_seconds,
        checkpoint_ms,
    })
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("speech_limit")
        .invoke_handler(tauri::generate_handler![usage])
        .build()
}
