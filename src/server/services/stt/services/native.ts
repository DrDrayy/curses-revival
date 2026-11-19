import i18n from "i18next";
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

// the message in the user's language, or the English one if the translations are not loaded
function message(key: string, english: string): string {
  try {
    const text = i18n.t(key, { defaultValue: english });
    return typeof text === "string" && text && text !== key ? text : english;
  } catch {
    return english;
  }
}

function giveUpMessage() {
  return message("stt.native_give_up",
    "Microsoft's speech service is not answering (network error). Try Browser with Chrome, Deepgram or Azure.");
}

// "network" before the session even started, twice in a row: Microsoft refused it without sending anything,
// which is what its free daily limit does (about 10 hours of speech a day for the app, counted again 24 hours later)
function dailyLimitMessage() {
  return message("stt.native_daily_limit",
    "Microsoft's speech service refused to start. Most likely its free daily limit (about 10 hours of speech) is used up. It comes back within 24 hours. Until then, use Browser with Chrome, Deepgram or Azure.");
}

// a final result that is only the replacement character "�" (or nothing) is junk
const hasText = (text: string) => /[^�\s]/.test(text ?? "");

// Microsoft's online service ends every session after about 46-50 s with "network"
// (its server closes it: "Unsupported audio format."). Start a new session at the next pause
// after this long, so the cut never lands in the middle of a sentence.
const ROLLOVER_AFTER = 35000;

export class STT_NativeService implements ISTTService {
  constructor(private bindings: ISTTReceiver) {}

  #instance?: SpeechRecognition;
  #stopped = true;
  #networkFails = 0;
  // the current session got "start": Microsoft accepted it
  #sessionStarted = false;
  // when it started, and whether it has sent any result yet
  #sessionStartedAt = 0;
  #sessionHadResult = false;
  // live text not yet followed by a final result
  #pendingInterim = "";
  // a new session is being started at a pause (see ROLLOVER_AFTER)
  #rollingOver = false;
  // "network" before "start", in a row
  #refusedRun = 0;
  // a new session is planned
  #retryTimer?: ReturnType<typeof setTimeout>;
  // start() was called and "end" has not come yet: a new start() now would throw
  #running = false;
  // start the next session as soon as "end" comes (or when the safety wait runs out)
  #beginWhenEnded = false;

  dispose(): void {}

  #processResults = (event: any) => {
    let interim_transcript = "";
    let gotFinal = false;
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        gotFinal = true;
        // each final result once, not joined with the ones before it
        const text = event.results[i][0].transcript;
        if (hasText(text))
          this.bindings.onFinal(text);
      } else {
        interim_transcript += event.results[i][0].transcript;
        this.bindings.onInterim(interim_transcript);
      }
    }
    this.#pendingInterim = interim_transcript;
    // a pause after a long session: start a new one now, before Microsoft cuts this one
    if (gotFinal && !interim_transcript && this.#sessionStarted
      && performance.now() - this.#sessionStartedAt >= ROLLOVER_AFTER)
      this.#rollover();
  };

  // only called at a pause (a final result and no live text), so no words are waiting:
  // abort() ends the session at once and the next one starts when "end" comes (3 s at most)
  #rollover() {
    if (this.#rollingOver)
      return;
    this.#rollingOver = true;
    this.#retryAfter(0);
  }

  // the session ended without its final result: keep the words heard so far
  #flushInterim() {
    const text = this.#pendingInterim;
    this.#pendingInterim = "";
    if (hasText(text))
      this.bindings.onFinal(text);
  }

  // start a new session on the current instance
  #begin() {
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    if (this.#stopped)
      return;
    // the old session has not ended yet: start when it does, or after a safety wait if "end" never comes
    if (this.#running) {
      this.#beginWhenEnded = true;
      this.#retryTimer = setTimeout(() => {
        this.#running = false;
        this.#begin();
      }, 3000);
      return;
    }
    this.#beginWhenEnded = false;
    this.#sessionStarted = false;
    this.#sessionHadResult = false;
    this.#pendingInterim = "";
    this.#rollingOver = false;
    try {
      this.#instance?.start();
      this.#running = true;
    } catch (error: any) {
      // still running after all: try again shortly instead of giving up
      if (error?.name === "InvalidStateError") {
        this.#running = true;
        this.#beginWhenEnded = true;
        this.#retryTimer = setTimeout(() => {
          this.#running = false;
          this.#begin();
        }, 1000);
        return;
      }
      this.stop(String(error));
    }
  }

  // after an error: end this session now (its "end" may never come) and start a new one after the wait
  #retryAfter(delay: number) {
    clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(() => this.#begin(), delay);
    try {
      this.#instance?.abort();
    } catch {}
  }

  start(state: STT_State): void {
    if (Object.values(state.native).some(isEmptyValue))
      return this.bindings.onStop("Options missing");

    // started again without a stop: end the old one quietly
    if (this.#instance && !this.#stopped) {
      this.#instance.onend = null;
      try {
        this.#instance.abort();
      } catch {}
    }

    const sp = window.webkitSpeechRecognition || window.SpeechRecognition;

    const instance = new sp();
    this.#instance = instance;
    instance.lang = state.native.language;
    instance.continuous = true;
    instance.interimResults = true;

    this.#stopped = false;
    this.#networkFails = 0;
    this.#refusedRun = 0;
    this.#running = false;
    this.#beginWhenEnded = false;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    // events of an older instance (stopped, then started again) are ignored
    const current = () => this.#instance === instance && !this.#stopped;

    instance.onstart = () => {
      if (!current())
        return;
      this.#sessionStarted = true;
      this.#sessionStartedAt = performance.now();
      this.#refusedRun = 0;
      this.bindings.onStart();
    };
    instance.onresult = (event: any) => {
      // the last words after a normal stop still count
      if (this.#instance !== instance)
        return;
      // the service answered: count network failures from zero again
      this.#networkFails = 0;
      this.#sessionHadResult = true;
      this.#processResults(event);
    };
    instance.onerror = (error: any) => {
      if (!current())
        return;
      // silence, or our own stop() / abort(); while a new session is started at a pause,
      // anything the old one reports is expected: "end" starts the next one
      if (error.error === "no-speech" || error.error === "aborted" || this.#rollingOver)
        return;
      if (error.error === "network") {
        // refused twice in a row before it started: the daily limit, retrying can't help
        if (!this.#sessionStarted && ++this.#refusedRun >= 2)
          return this.stop(dailyLimitMessage());
        // the words heard so far would be lost with this session
        this.#flushInterim();
        // a session that was already answering got cut (Microsoft's regular cut after ~46 s):
        // not a failure, start the next one at once
        if (this.#sessionStarted && this.#sessionHadResult)
          return this.#retryAfter(0);
        // refused after it started, or no connection: try again after a wait
        this.#networkFails++;
        if (this.#networkFails > NETWORK_RETRIES)
          return this.stop(giveUpMessage());
        return this.#retryAfter(RETRY_DELAYS[Math.min(this.#networkFails, RETRY_DELAYS.length) - 1]);
      }
      this.stop(error.error);
    };
    // keep alive: a normal end (silence) starts again at once, one that never started waits a second
    instance.onend = () => {
      if (this.#instance !== instance)
        return;
      this.#running = false;
      if (this.#stopped)
        return;
      // a new session was waiting for this one to end
      if (this.#beginWhenEnded)
        return this.#begin();
      if (this.#retryTimer !== undefined)
        return;
      this.#retryTimer = setTimeout(() => this.#begin(), this.#sessionStarted ? 0 : 1000);
    };
    this.#begin();

    window.onbeforeunload = () => this.#instance?.stop();
  }

  stop(error?: string): void {
    if (!this.#instance || this.#stopped)
      return;
    this.#stopped = true;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    this.#instance.onend = null;
    try {
      // after an error end at once; a normal stop lets the last words arrive
      if (error)
        this.#instance.abort();
      else
        this.#instance.stop();
    } catch {}
    this.bindings.onStop(error);
  }
}
