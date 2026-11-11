import {
  SpeechConfig,
  SpeechSynthesisOutputFormat,
  SpeechSynthesizer
} from "microsoft-cognitiveservices-speech-sdk";
import { isEmptyValue, parseFloatOr } from "../../../../utils";
import { TTS_State } from "../schema";
import { ITTSReceiver, ITTSService } from "../types";

// escape text and attribute values for SSML (xml)
function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export class TTS_AzureService implements ITTSService {
  constructor(private bindings: ITTSReceiver) {}

  dispose(): void {}

  #instance?: SpeechSynthesizer;

  start(state: TTS_State): void {
    // exclude optional
    const {voiceStyle, voiceRole, ...test} = state.azure;
    if (Object.values(test).some(isEmptyValue)) return this.bindings.onStop("Options missing");

    try {
      // const audioConfig                     = AudioConfig.fromSpeakerOutput(p);
      const speechConfig = SpeechConfig.fromSubscription(
        state.azure.key,
        state.azure.location
      );
      speechConfig.speechSynthesisLanguage = state.azure.language;
      speechConfig.speechSynthesisVoiceName = state.azure.voice;
      speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3;
      this.#instance = new SpeechSynthesizer(speechConfig, null as any);

      this.bindings.onStart();
    } catch (error: any) {
      this.bindings.onStop(error?.message as string);
    }
  }

  get state() {
    return window.ApiServer.state.services.tts.data.azure;
  }

  play(value: string): void {
    const ssml = `
    <speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="en-US">
      <voice name="${escapeXml(this.state.voice)}" ${this.state.voiceStyle ? `style="${escapeXml(this.state.voiceStyle)}"` : ''} ${this.state.voiceRole ? `role="${escapeXml(this.state.voiceRole)}"` : ''}>
      <prosody volume="${escapeXml(this.state.voiceVolume || "default")}" rate="${escapeXml(this.state.voiceRate || "default")}" pitch="${escapeXml(this.state.voicePitch || "default")}" range="${escapeXml(this.state.voiceRange || "default")}">
        ${escapeXml(value)}
      </prosody>
      </voice>
    </speak>
    `
    value &&
    this.#instance?.speakSsmlAsync(ssml, result => {
      window.ApiServer.sound.enqueueVoiceClip(result.audioData, {
        volume: parseFloatOr(this.state.volume, 1),
        rate: parseFloatOr(this.state.rate, 1),
        device_name: this.state.device
      });
    },
    (e) => {
      this.#instance?.close();
      this.bindings.onStop(e);
    })
  }
  stop(): void {
    this.#instance?.close();
    this.bindings.onStop();
  }
}
