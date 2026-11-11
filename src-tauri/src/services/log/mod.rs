use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    command,
    plugin::{Builder, TauriPlugin},
    Runtime,
};

const MAX_FILE_BYTES: u64 = 1_000_000; // ~1 MB, then curses.log -> curses.old.log
const MAX_MESSAGE_CHARS: usize = 4000;

/// Log folder. The mutex is also the write lock: every write holds it, so lines never mix.
/// (A static instead of managed state, so log_error works without an AppHandle.)
static LOG_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

/// UTC time as "YYYY-MM-DDTHH:MM:SSZ" (days-to-date conversion by Howard Hinnant).
fn utc_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    if month <= 2 {
        year += 1;
    }
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year,
        month,
        day,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn clean_level(level: &str) -> &'static str {
    match level.trim().to_ascii_lowercase().as_str() {
        "error" => "error",
        "warn" | "warning" => "warn",
        _ => "info",
    }
}

fn clean_message(message: &str) -> String {
    let mut out = String::new();
    for (i, c) in message.chars().enumerate() {
        if i >= MAX_MESSAGE_CHARS {
            out.push_str("...[cut]");
            break;
        }
        match c {
            '\r' => {}
            '\n' => out.push_str("\n    "), // keep stack traces readable, one entry = one block
            c if c.is_control() => out.push(' '),
            c => out.push(c),
        }
    }
    out
}

/// Appends one line. `wait`: false = give up instead of waiting for the lock (used by the panic hook).
fn write_line(level: &str, message: &str, wait: bool) {
    let guard = if wait {
        Some(LOG_DIR.lock().unwrap_or_else(|e| e.into_inner()))
    } else {
        LOG_DIR.try_lock().ok()
    };
    let Some(guard) = guard else { return };
    let Some(dir) = guard.as_ref() else { return };

    let _ = fs::create_dir_all(dir);
    let file = dir.join("curses.log");
    if let Ok(meta) = fs::metadata(&file) {
        if meta.len() > MAX_FILE_BYTES {
            let old = dir.join("curses.old.log");
            let _ = fs::remove_file(&old); // rename may not replace an existing file on Windows
            let _ = fs::rename(&file, &old);
        }
    }
    let line = format!("{} [{}] {}\n", utc_now(), clean_level(level), clean_message(message));
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&file) {
        let _ = f.write_all(line.as_bytes());
    }
}

/// For other Rust modules. Never panics, does nothing before the plugin is set up.
pub fn log_error(msg: &str) {
    write_line("error", msg, true);
}

#[command]
fn write(level: String, message: String) {
    write_line(&level, &message, true);
}

#[command]
fn open_folder() {
    // the path comes only from Rust
    let dir = {
        let guard = LOG_DIR.lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_ref() {
            Some(d) => d.clone(),
            None => return,
        }
    };
    let _ = fs::create_dir_all(&dir);
    if cfg!(target_os = "windows") {
        let _ = Command::new("explorer").arg(&dir).spawn(); // explorer exits with code 1 even on success
    }
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info.payload();
        let text = if let Some(s) = payload.downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic".to_string()
        };
        let place = match info.location() {
            Some(l) => format!("{}:{}:{}", l.file(), l.line(), l.column()),
            None => "unknown location".to_string(),
        };
        write_line("error", &format!("panic: {} at {}", text, place), false);
        previous(info);
    }));
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("log")
        .invoke_handler(tauri::generate_handler![write, open_folder])
        .setup(|app| {
            if let Some(dir) = app.path_resolver().app_log_dir() {
                let _ = fs::create_dir_all(&dir);
                *LOG_DIR.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir);
            }
            install_panic_hook();
            Ok(())
        })
        .build()
}
