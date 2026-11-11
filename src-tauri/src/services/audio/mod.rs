use std::io::Cursor;

use rodio::{
    cpal::{self, traits::HostTrait},
    Decoder, DeviceTrait, OutputStream, OutputStreamHandle, Sink,
};
use serde::{Serialize, Deserialize};
use tauri::{
    command,
    plugin::{Builder, TauriPlugin},
    Runtime,
};

fn get_output_stream(device_name: &str) -> Result<(OutputStream, OutputStreamHandle), String> {
    let host = cpal::default_host();
    let mut devices = host.output_devices().map_err(|err| format!("Unable to list audio devices: {}", err))?;
    let Some(device) = devices.find(|device| device.name().map(|name| name == device_name).unwrap_or(false)) else {
        return Err("Invalid device".into());
    };
    OutputStream::try_from_device(&device).map_err(|err| format!("Unable to open audio device: {}", err))
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RpcAudioPlayAsync {
    pub device_name: String,
    pub data: Vec<u8>,
    pub volume: f32, // 1 - base
    pub rate: f32, // 1 - base
}

// The audio stream can't be sent between threads: all of it lives inside this one (blocking) call.
fn play_blocking(data: RpcAudioPlayAsync) -> Result<(), String> {
    let (_stream, stream_handle) = get_output_stream(data.device_name.as_str())?;
    let sink = Sink::try_new(&stream_handle).map_err(|err| format!("Unable to create audio player: {}", err))?;
    sink.set_volume(data.volume);
    sink.set_speed(data.rate);
    let Ok(source) = Decoder::new(Cursor::new(data.data)) else {
        return Err("Unable to play file".into());
    };
    sink.append(source);
    sink.sleep_until_end();
    Ok(())
}

#[command]
pub async fn play_async(data: RpcAudioPlayAsync) -> Result<(), String> {
    // sleep_until_end blocks until the sound is over, so keep it off the async workers
    tauri::async_runtime::spawn_blocking(move || play_blocking(data))
        .await
        .map_err(|err| format!("Audio playback failed: {}", err))?
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("audio")
        .invoke_handler(tauri::generate_handler![play_async])
        .build()
}
