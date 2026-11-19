import { IVRCTarget }  from "../types";
import { sendOsc, splitText } from "./utils";
import throttle       from "lodash/throttle";

// vrchat chatbox limit
const MAX_LENGTH = 144;
// wait between chunks: long enough to read, at least 1.5s
const MIN_GAP = 1500;
const MS_PER_CHAR = 25;
// chunks that may wait for their turn, the oldest are dropped when speech is faster than the chatbox
const MAX_WAITING = 3;
// live text: at most one update this often (faster chatbox messages get dropped or timed out by VRChat)
const LIVE_GAP = 1500;
// live text that arrives this soon after a finished sentence is a late part of that sentence (the UwU
// filter can delay it): it must not replace the finished sentence or turn the typing bubble on again
const LATE_LIVE_MS = 500;

// the newest words that fit in the chatbox
function lastPart(text: string, max: number) {
  const chars = Array.from(text);
  if (chars.length <= max)
    return text;
  let tail = chars.slice(chars.length - (max - 1)).join("");
  // start at a whole word
  const space = tail.indexOf(" ");
  if (space >= 0 && space < 30)
    tail = tail.slice(space + 1);
  return "\u2026" + tail;
}

class VRC_TextboxTarget implements IVRCTarget {
  #queue: string[] = [];
  #timer?: ReturnType<typeof setTimeout>;
  // earliest time the next message may replace the one on screen
  #nextSendAt = 0;
  // live text: the newest words so far, the last ones sent, and the planned update
  #liveText = "";
  #liveSent = "";
  #liveTimer?: ReturnType<typeof setTimeout>;
  #lastFinalAt = 0;

  #sendChunk(text: string) {
    sendOsc("/chatbox/input", [
      { String: text }, // value
      { Bool: true }, // is final
      { Bool: this.state.notifySound }, // play the notification sound
    ]);
    // give every message its reading time (and stay under the chatbox rate limit)
    this.#nextSendAt = Date.now() + Math.max(MIN_GAP, Array.from(text).length * MS_PER_CHAR);
    this.#scheduleNext();
  }

  // send the next waiting chunk once the one on screen had its reading time
  #scheduleNext() {
    if (this.#timer !== undefined || !this.#queue.length)
      return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const next = this.#queue.shift();
      if (next !== undefined)
        this.#sendChunk(next);
    }, Math.max(0, this.#nextSendAt - Date.now()));
  }

  #stopLive() {
    clearTimeout(this.#liveTimer);
    this.#liveTimer = undefined;
    this.#liveText = "";
    this.#liveSent = "";
  }

  // show the newest live text once the chatbox may change again
  #scheduleLive() {
    if (this.#liveTimer !== undefined)
      return;
    this.#liveTimer = setTimeout(() => {
      this.#liveTimer = undefined;
      // switched off meanwhile; finished sentences still waiting go first
      if (!this.state.liveText || this.#timer !== undefined || this.#queue.length)
        return;
      if (Date.now() < this.#nextSendAt)
        return this.#scheduleLive();
      const text = this.#liveText;
      if (!text || text === this.#liveSent)
        return;
      this.#liveSent = text;
      sendOsc("/chatbox/input", [
        { String: text },
        { Bool: true },
        { Bool: false }, // no sound while speaking
      ]);
      this.#nextSendAt = Date.now() + LIVE_GAP;
    }, Math.max(0, this.#nextSendAt - Date.now()));
  }

  pushFinal(value: string): void {
    // the finished sentence replaces the live text
    this.#stopLive();
    this.#lastFinalAt = Date.now();
    // the message replaces the typing bubble
    this.#stopIndicator();
    // the chatbox shows at most 9 lines: no line breaks
    const text = value.replace(/\s*[\r\n]+\s*/g, " ").trim();
    if (!text)
      return;
    // chunks of earlier sentences still get their turn, the new ones go to the end
    this.#queue.push(...splitText(text, MAX_LENGTH));
    // chatbox free: the first chunk goes out now (it is not waiting)
    if (this.#timer === undefined && Date.now() >= this.#nextSendAt) {
      const first = this.#queue.shift();
      if (first !== undefined)
        this.#sendChunk(first);
    }
    // speech faster than the chatbox: drop the oldest waiting chunks
    if (this.#queue.length > MAX_WAITING)
      this.#queue.splice(0, this.#queue.length - MAX_WAITING);
    this.#scheduleNext();
  }

  get state() {
    return window.ApiServer.state.services.vrc.data.textbox;
  }

  #sendIndicatorThrottled = throttle(this.#sendIndicator, 1400);
  #sendIndicator(value: boolean) {
    sendOsc("/chatbox/typing", [{ Bool: value }]);
  }
  // typing bubble turned on by us
  #indicatorOn = false;
  // turn the bubble off, and drop a throttled "on" that would otherwise arrive after the message
  #stopIndicator() {
    this.#sendIndicatorThrottled.cancel();
    if (this.#indicatorOn) {
      this.#indicatorOn = false;
      this.#sendIndicator(false);
    }
  }
  pushInterim(value: string): void {
    // a late part of the sentence that just finished: no live text, no typing bubble
    if (Date.now() - this.#lastFinalAt < LATE_LIVE_MS)
      return;
    if (this.state.liveText) {
      const text = lastPart((value ?? "").replace(/\s+/g, " ").trim(), MAX_LENGTH);
      if (text) {
        this.#liveText = text;
        this.#scheduleLive();
      }
    }
    if (this.state.indicator) {
      this.#indicatorOn = true;
      this.#sendIndicatorThrottled(true);
    }
  }
  cancel(): void {
    this.#stopLive();
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#queue = [];
    this.#stopIndicator();
  }
}

export default VRC_TextboxTarget;
