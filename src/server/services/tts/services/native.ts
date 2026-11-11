import { parseFloatOr } from "../../../../utils";
import { TTS_State } from "../schema";
import { ITTSReceiver, ITTSService } from "../types";

// how long to wait for the browser to list its voices
const VOICES_TIMEOUT = 3000;

export class TTS_NativeService implements ITTSService {
  constructor(private bindings: ITTSReceiver) {}
  #voice?: SpeechSynthesisVoice;
  // keep references while speaking, some browsers drop utterances that get garbage collected
  #active = new Set<SpeechSynthesisUtterance>();

  dispose(): void {}

  async start(state: TTS_State) {
    try {
      if (!this.state.voice)
        return this.bindings.onStop("Options missing");

      let voices = window.speechSynthesis.getVoices();
      if (!voices.length) {
        // wait for voices, but not forever
        await new Promise<void>(res => {
          const done = () => {
            clearTimeout(timer);
            window.speechSynthesis.onvoiceschanged = null;
            res();
          };
          const timer = setTimeout(done, VOICES_TIMEOUT);
          window.speechSynthesis.onvoiceschanged = done;
        });
      }

      voices = window.speechSynthesis.getVoices();
      let voice = voices.find(voice => voice.voiceURI === this.state.voice);

      if (!voice) {
        this.bindings.onStop(voices.length ? "Invalid voice" : "No voices available");
        return;
      }

      this.#voice = voice;

      this.bindings.onStart();
    } catch (error: any) {
      this.bindings.onStop(error?.message);
    }
  }

  get state() {
    return window.ApiServer.state.services.tts.data.native;
  }
  play(value: string): void {
    if (!this.#voice)
      return;
    // new utterance for every line, a reused one can't be queued twice
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.voice = this.#voice;
    utterance.pitch = parseFloatOr(this.state.pitch, 1);
    utterance.rate = parseFloatOr(this.state.rate, 1);
    utterance.volume = parseFloatOr(this.state.volume, 1);
    const release = () => this.#active.delete(utterance);
    utterance.onend = release;
    utterance.onerror = release;
    this.#active.add(utterance);
    window.speechSynthesis.speak(utterance);
  }
  stop(): void {
    this.bindings.onStop();
  }
}
