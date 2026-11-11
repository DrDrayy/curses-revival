use std::io::ErrorKind;
use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use rosc::{decoder, encoder, OscMessage, OscPacket, OscType};
use serde::{Deserialize, Serialize};
use tauri::{
    command,
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime, State,
};

// built-in avatar parameter, sent by VRChat when it changes: true when the headset is off,
// the system menu is open or End is pressed on desktop
const AFK_PARAMETER: &str = "/avatar/parameters/AFK";
// how long recv_from waits before the listener looks at its stop flag again
const READ_TIMEOUT: Duration = Duration::from_millis(500);
// "seen" events go to the app at most this often
const SEEN_INTERVAL: Duration = Duration::from_secs(1);


pub struct OscPlugin {
    socket: Option<UdpSocket>,
}

impl Default for OscPlugin {
    fn default() -> Self {
        // any free port to send from: a fixed one may be taken by another app
        let Ok(socket) = UdpSocket::bind("127.0.0.1:0") else {
            return Self { socket: None };
        };
        OscPlugin { socket: Some(socket) }
    }
}

impl OscPlugin {
    fn send(&self, rpc: RpcOscMessage) {
        let Some(socket) = &self.socket else {
            return;
        };

        let addr = SocketAddr::from(([127, 0, 0, 1], 9000));
        let args: Vec<OscType> = rpc
            .args
            .iter()
            .map(|arg| {
                let tt = match arg {
                    OscValue::Bool(v) => OscType::from(*v),
                    OscValue::Float(v) => OscType::Float(*v as f32),
                    OscValue::Int(v) => OscType::Int(*v as i32),
                    OscValue::String(v) => OscType::from(v.to_string())
                };
                tt
            })
            .collect();

        let msg_buf = match encoder::encode(&OscPacket::Message(OscMessage { addr: rpc.path, args })) {
            Ok(buf) => buf,
            Err(err) => {
                eprintln!("osc: unable to encode the message: {:?}", err);
                crate::services::log::log_error(&format!("osc: unable to encode the message: {:?}", err));
                return;
            }
        };
        if let Err(err) = socket.send_to(&msg_buf, addr) {
            eprintln!("osc: unable to send the message: {}", err);
            crate::services::log::log_error(&format!("osc: unable to send the message: {}", err));
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
enum OscValue {
    Bool(bool),
    Float(f64),
    Int(i64),
    String(String),
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RpcOscMessage {
    path: String,
    args: Vec<OscValue>,
}

#[command]
fn send(rpc: RpcOscMessage, state: State<OscPlugin>) {
    state.send(rpc);
}

/// Sent to the app as the "vrc_osc" event: `{ "kind": "afk", "value": true }` or `{ "kind": "seen" }`
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum VrcOscEvent {
    Afk { value: bool },
    Seen,
}

struct Listener {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

/// Receives what VRChat sends out over OSC, one port at a time
#[derive(Default)]
pub struct OscListener {
    current: Mutex<Option<Listener>>,
}

fn emit<R: Runtime>(app: &AppHandle<R>, event: VrcOscEvent) {
    if let Err(err) = app.emit_all("vrc_osc", event) {
        eprintln!("osc: unable to send the event to the app: {}", err);
    }
}

// a bundle may hold messages and other bundles
fn handle_packet<R: Runtime>(app: &AppHandle<R>, packet: &OscPacket) {
    match packet {
        OscPacket::Message(msg) => {
            if msg.addr != AFK_PARAMETER {
                return;
            }
            let value = match msg.args.first() {
                Some(OscType::Bool(v)) => *v,
                Some(OscType::Int(v)) => *v != 0,
                Some(OscType::Float(v)) => *v != 0.0,
                _ => return,
            };
            emit(app, VrcOscEvent::Afk { value });
        }
        OscPacket::Bundle(bundle) => {
            for inner in &bundle.content {
                handle_packet(app, inner);
            }
        }
    }
}

fn receive<R: Runtime>(app: AppHandle<R>, socket: UdpSocket, stop: Arc<AtomicBool>) {
    // big enough for any UDP packet
    let mut buf = vec![0u8; 65536];
    let mut last_seen: Option<Instant> = None;
    let mut error_logged = false;
    // checked after every packet too: while VRChat keeps sending, the timeout never comes
    while !stop.load(Ordering::SeqCst) {
        let size = match socket.recv_from(&mut buf) {
            Ok((size, _from)) => size,
            // nothing arrived in time: Windows says TimedOut, other systems WouldBlock
            Err(err) if matches!(err.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut | ErrorKind::Interrupted) => continue,
            Err(err) => {
                if !error_logged {
                    error_logged = true;
                    eprintln!("osc: unable to receive: {}", err);
                    crate::services::log::log_error(&format!("osc: unable to receive: {}", err));
                }
                // an error that repeats must not keep the CPU busy
                std::thread::sleep(READ_TIMEOUT);
                continue;
            }
        };
        let packet = match decoder::decode_udp(&buf[..size]) {
            Ok((_rest, packet)) => packet,
            // not OSC
            Err(_) => continue,
        };
        if last_seen.map_or(true, |at| at.elapsed() >= SEEN_INTERVAL) {
            last_seen = Some(Instant::now());
            emit(&app, VrcOscEvent::Seen);
        }
        handle_packet(&app, &packet);
    }
}

// async: commands without it run on the main thread, and this one may wait for the old listener
#[command]
async fn listen<R: Runtime>(app: AppHandle<R>, port: u16, state: State<'_, OscListener>) -> Result<(), String> {
    let mut current = state.current.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // the old listener lets go of its port within the read timeout
    if let Some(old) = current.take() {
        old.stop.store(true, Ordering::SeqCst);
        let _ = old.thread.join();
    }

    let socket = match UdpSocket::bind(SocketAddr::from(([127, 0, 0, 1], port))) {
        Ok(socket) => socket,
        Err(err) if err.kind() == ErrorKind::AddrInUse => {
            return Err(format!("Port {} is already used by another app", port));
        }
        Err(err) => return Err(format!("Unable to listen on port {}: {}", port, err)),
    };
    // without a timeout the thread could wait for a packet forever and never see the stop flag
    if let Err(err) = socket.set_read_timeout(Some(READ_TIMEOUT)) {
        return Err(format!("Unable to listen on port {}: {}", port, err));
    }

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let thread = std::thread::Builder::new()
        .name("osc-listen".to_string())
        .spawn(move || receive(app, socket, thread_stop))
        .map_err(|err| format!("Unable to listen on port {}: {}", port, err))?;
    *current = Some(Listener { stop, thread });
    Ok(())
}

#[command]
fn stop_listen(state: State<OscListener>) {
    let current = state.current.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // the thread ends within the read timeout and drops the socket; the next listen() waits for it
    if let Some(listener) = &*current {
        listener.stop.store(true, Ordering::SeqCst);
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("osc")
        .invoke_handler(tauri::generate_handler![send, listen, stop_listen])
        .setup(|app| {
            app.manage(OscPlugin::default());
            app.manage(OscListener::default());
            Ok(())
        })
        .build()
}
