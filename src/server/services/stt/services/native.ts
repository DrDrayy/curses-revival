import { isEmptyValue } from "@/utils";
import { STT_State } from "../schema";
import {
  ISTTReceiver,
  ISTTService
} from "../types";

// "network" means the trip to Microsoft's online speech service failed (often a short drop):
// wait and try again instead of stopping at once, give up after this many failures in a row
const NETWORK_RETRIES = 5;
// waits before each new try (ms); about 25 s in total before giving up
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 10000];
export const NATIVE_GIVE_UP_MESSAGE = "Microsoft's speech service is not answering (network error). Try Google (via Chrome), Deepgram or Azure.";

export class STT_NativeService implements ISTTService {
  constructor(private bindings: ISTTReceiver) {}
  
  #instance?: SpeechRecognition;
  #stopped = true;
  #networkFails = 0;
  // the session that just ended failed with "network": wait before the next try
  #endAfterError = false;
  #retryTimer?: ReturnType<typeof setTimeout>;
  
  dispose(): void {}
  
  #processResults = (event: any) => {
    let interim_transcript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        // each final result once, not joined with the ones before it
        this.bindings.onFinal(event.results[i][0].transcript);
      } else {
        interim_transcript += event.results[i][0].transcript;
        this.bindings.onInterim(interim_transcript);
      }
    }
  };
  
  start(state: STT_State): void {
    if (Object.values(state.native).some(isEmptyValue))
      return this.bindings.onStop("Options missing");

    const sp = window.webkitSpeechRecognition || window.SpeechRecognition;

    this.#instance = new sp();
    this.#instance.lang = state.native.language;
    this.#instance.continuous = true;
    this.#instance.interimResults = true;

    this.#stopped = false;
    this.#networkFails = 0;
    this.#endAfterError = false;
    this.#instance.onstart = () => this.bindings.onStart();
    this.#instance.onresult = (event: any) => {
      // the service answered: count network failures from zero again
      this.#networkFails = 0;
      this.#processResults(event);
    };
    
    this.#instance.addEventListener("error", (error) => {
      // silence, or our own stop()
      if (error.error === "no-speech" || error.error === "aborted")
        return;
      if (error.error === "network") {
        this.#networkFails++;
        this.#endAfterError = true;
        if (this.#networkFails > NETWORK_RETRIES)
          this.stop(NATIVE_GIVE_UP_MESSAGE);
        // otherwise "end" follows and starts it again after a wait
        return;
      }
      this.stop(error.error);
    });
    // keep alive: start again when it ends, after a wait if the last try failed
    this.#instance.onend = () => {
      if (this.#stopped)
        return;
      // a normal end (silence) starts again at once, only a failed try waits
      const delay = this.#endAfterError ? RETRY_DELAYS[Math.min(this.#networkFails, RETRY_DELAYS.length) - 1] : 0;
      this.#endAfterError = false;
      clearTimeout(this.#retryTimer);
      this.#retryTimer = setTimeout(() => {
        if (this.#stopped)
          return;
        try {
          this.#instance?.start();
        } catch (error) {
          this.stop(String(error));
        }
      }, delay);
    };
    this.#instance.start();

    window.onbeforeunload = () => this.#instance?.stop();
  }

  stop(error?: string): void {
    if (!this.#instance || this.#stopped)
      return;
    this.#stopped = true;
    clearTimeout(this.#retryTimer);
    this.#instance.onend = null;
    this.#instance.stop();
    this.bindings.onStop(error);
  }
}
