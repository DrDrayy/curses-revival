use serde::{Deserialize, Serialize};
use tauri::{
    command,
    plugin::{Builder, TauriPlugin},
    Runtime
};

use crate::services::audio::{play_async, RpcAudioPlayAsync};

#[derive(Serialize, Deserialize, Debug)]
struct UberDuckAuth{
    api_key: String,
    secret_key: String
}

#[derive(Serialize, Deserialize, Debug)]
struct Voice{
    model_id: String,
    voicemodel_uuid: String,
    display_name: String
}


#[derive(Serialize, Deserialize, Debug)]
struct UberduckRequest {
    auth: UberDuckAuth,
    text: String,
    device_name: String,
    voicemodel_uuid: String,
    volume: f32
}

#[derive(Serialize, Deserialize, Debug)]
struct SynthRequest {
    speech: String,
    voicemodel_uuid: String,
}

fn http_error(status: reqwest::StatusCode) -> String {
    format!("Uberduck request failed (HTTP {})", status.as_u16())
}

#[command]
async fn get_voices(auth: UberDuckAuth) -> Result<Vec<Voice>, String> {
    let client = reqwest::Client::new();
    let resp = client.get("https://api.uberduck.ai/voices?mode=tts-all")
        .basic_auth(auth.api_key, Some(auth.secret_key))
        .send()
        .await
        .map_err(|err| format!("Unable to load voices: {}", err))?;
    if !resp.status().is_success() {
        return Err(http_error(resp.status()));
    }
    resp.json::<Vec<Voice>>().await.map_err(|_| "Unable to load voices".to_string())
}

#[command]
async fn speak(data: UberduckRequest) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.uberduck.ai/speak-synchronous")
        .basic_auth(data.auth.api_key, Some(data.auth.secret_key))
        .json(&SynthRequest {
            speech: data.text,
            voicemodel_uuid: data.voicemodel_uuid,
        })
        .send()
        .await
        .map_err(|err| format!("Request failed: {}", err))?;
    if !resp.status().is_success() {
        return Err(http_error(resp.status()));
    }
    let audio = resp.bytes().await.map_err(|err| format!("Unable to read the audio: {}", err))?;
    play_async(RpcAudioPlayAsync {
        device_name: data.device_name,
        data: audio.to_vec(),
        volume: data.volume,
        rate: 1.0,
    })
    .await
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("uberduck_tts")
        .invoke_handler(tauri::generate_handler![speak, get_voices])
        .build()
}
