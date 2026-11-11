import fastEqual from "fast-deep-equal";
import { FC, memo, useCallback, useEffect, useState } from "react";
import { subscribe, useSnapshot } from "valtio";
import { useGetState } from "../..";
import { TextEvent, TextEventSource, TextEventType } from "../../../types";
import { CssReplaceFileReference } from "../utils";
import { Element_TextState } from "./schema";
import { buildStateStyle, elementStyle } from "./style";

const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
// text must never reach innerHTML unescaped
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => htmlEscapes[c]);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// scanForEmotes matches an emote on the word without its symbols ("(Kappa)," -> "Kappa"):
// keep those symbols around the image ("(" + image + "),")
const emoteWordEdges = (word: string): [string, string] => {
  const leading = /^\W*/.exec(word)?.[0] ?? "";
  const trailing = /\W*$/.exec(word.substring(leading.length))?.[0] ?? "";
  return [leading, trailing];
};

// words with a mask (*) in them, same pattern for static and animated modes
const profanityPattern = /[^\s\.,?!]*\*+[^\s\.,?!]*/;

type SentenceState = {
  type: TextEventType
  element: HTMLElement
  text: string
  cursor: number
  cursorProfanity: number
  profanityCursorList: Record<number, any>
  isAnimated: boolean,
  emotes: Record<number, string>
}

class TextController {
  constructor(private id: string) {}
  private disposed: boolean = false;

  private boxElement!: HTMLElement
  private containerElement?: HTMLElement
  private scrollContainerElement!: HTMLElement
  private textElement!: HTMLElement
  private textEndElement!: HTMLSpanElement
  private baseStyleElement!: HTMLStyleElement;
  private stateStyleElement!: HTMLStyleElement;
  private customStyleElement!: HTMLStyleElement;

  private textObserver?: ResizeObserver;

  private eventTextRef: any;
  private eventTextInputRef: any;
  private storeEventCancelToken?: () => void;
  private sceneChangeEventCancelToken?: () => void;
  private fileUrlsEventCancelToken?: () => void;

  private currentState!: Element_TextState;
  private stateApplied = false; // false until styles and events are built for the current container
  private sentenceQueue: SentenceState[] = [];

  private isPlayingAnimation = false;

  private activityTimerHandle: number = -1;
  private activityTimerDelayClearHandle: number = -1;
  private animationTimerHandle: number = -1;

  onShow() {
    if (this.currentState.soundEnable && this.currentState.soundFileOnShow) {
      window.ApiClient.sound.playFile(this.currentState.soundFileOnShow, {volume: this.currentState.soundVolume ?? 1});
    }
  }
  onHide() {
    if (this.currentState.soundEnable && this.currentState.soundFileOnHide) {
      window.ApiClient.sound.playFile(this.currentState.soundFileOnHide, {volume: this.currentState.soundVolume ?? 1});
    }
  }
  onNewSentence() {}

  onActivity() {
    try {
      const rect = this.textEndElement.getBoundingClientRect();
  
      if (this.currentState.animateEvent) {
        window.ApiShared.pubsub.publishLocally({ topic: `element.${this.id}` });
      }
  
      if (rect && this.currentState.particlesEnable) {
        //TODO cache particle config
        window.ApiClient.particles.emit(rect, {
          imageIds: [
            this.currentState.particlesSpriteFileIdFirst,
            this.currentState.particlesSpriteFileIdSecond,
            this.currentState.particlesSpriteFileIdThird,
          ].filter(s => !!s),
          particlesCountMin: parseFloat(this.currentState.particlesCountMin) || 0,
          particlesCountMax: parseFloat(this.currentState.particlesCountMax) || 0,
          particlesDurationMin: parseFloat(this.currentState.particlesDurationMin) || 0,
          particlesDurationMax: parseFloat(this.currentState.particlesDurationMax) || 0,
          particlesDirectionXMin: parseFloat(this.currentState.particlesDirectionXMin) || 0,
          particlesDirectionXMax: parseFloat(this.currentState.particlesDirectionXMax) || 0,
          particlesDirectionYMin: parseFloat(this.currentState.particlesDirectionYMin) || 0,
          particlesDirectionYMax: parseFloat(this.currentState.particlesDirectionYMax) || 0,
          particlesScaleMin: parseFloat(this.currentState.particlesScaleMin) || 1,
          particlesScaleMax: parseFloat(this.currentState.particlesScaleMax) || 1,
          particlesRotationMin: parseFloat(this.currentState.particlesRotationMin) || 0,
          particlesRotationMax: parseFloat(this.currentState.particlesRotationMax) || 0,
        });
      }
  
      if (this.currentState.soundEnable && this.currentState.soundFile) {
        window.ApiClient.sound.playFile(this.currentState.soundFile, {
          volume: this.currentState.soundVolume ?? 1,
          detuneMin: this.currentState.soundDetuneMin ?? 0,
          detuneMax: this.currentState.soundDetuneMax ?? 0,
          playbackMin: this.currentState.soundPlaybackMin ?? 1,
          playbackMax: this.currentState.soundPlaybackMax ?? 1,
        });
      }
    } catch (error) {
      
    }
  }

  // start/restart activity timer
  triggerActivity() {
    // reset timer
    clearTimeout(this.activityTimerHandle);
    clearTimeout(this.activityTimerDelayClearHandle);

    // const previewEnabled = this.currentState.previewMode;
    

    if (!this.boxElement.classList.contains("active")) {
      this.onShow();
      this.boxElement.classList.add("active");
    }

    this.activityTimerHandle = setTimeout(() => {
      this.boxElement.classList.remove("active");

      this.onHide();

      this.activityTimerDelayClearHandle = setTimeout(() => {
        this.clearSentences();
      }, this.currentState.behaviorClearDelay) as unknown as number;
    }, this.currentState.behaviorClearTimer) as unknown as number;
  }

  clearSentences() {
    for (let v of this.sentenceQueue) {
      v.element.remove();
    }
    // this.textElement.replaceChildren();
    this.sentenceQueue.length = 0;
  }

  moveCursorToSpaceOrEnd(sentence: SentenceState) {
    let emoteEndIndex = sentence.text.indexOf(" ", sentence.cursor);
    if (emoteEndIndex === -1) { // if last
      emoteEndIndex = sentence.text.length;
    }
    sentence.cursor = emoteEndIndex;
  }

  stepSentenceAnimation(sentence: SentenceState) {
    if (this.disposed) {
      return
    }
    // end sentence animation
    if (sentence.cursor >= sentence.text.length) {
      sentence.isAnimated = true;
      this.isPlayingAnimation = false;
      this.tryAnimateNextSentence();
      // add space in the end
      sentence.element.innerHTML += " ";
      return;
    }

    this.isPlayingAnimation = true;

    this.triggerActivity();
    sentence.text[sentence.cursor] !== " " && this.onActivity();

    //profanity mask
    if (sentence.cursor in sentence.profanityCursorList) {
      const maskChars = Array.from(this.currentState.textProfanityMask ?? "");

      // empty mask: one empty span (as in static mode), then skip the word
      if (maskChars.length === 0) {
        sentence.element.innerHTML += `<span class="profanity"></span>`;
        this.moveCursorToSpaceOrEnd(sentence);
      }
      else if (this.currentState.animateDelayChar === 0) {
        sentence.element.innerHTML += `<span class="profanity">${escapeHtml(maskChars.join(""))}</span>`;
        this.moveCursorToSpaceOrEnd(sentence);
      }
      else {
        sentence.element.innerHTML += `<span class="profanity">${escapeHtml(maskChars[sentence.cursorProfanity])}</span>`;
  
        // finish mask stepping
        if (sentence.cursorProfanity +1 >= maskChars.length) {
          this.moveCursorToSpaceOrEnd(sentence);
          sentence.cursorProfanity = 0;
        }
        else {
          sentence.cursorProfanity++;
        }
      }
    }
    // insert emote
    else if (sentence.cursor in sentence.emotes) {
      const emoteStart = sentence.cursor;
      this.moveCursorToSpaceOrEnd(sentence);
      // always move forward: an emote position on a space (e.g. an emote named "7") would loop forever
      sentence.cursor = Math.max(sentence.cursor, emoteStart + 1);
      const [leading, trailing] = emoteWordEdges(sentence.text.substring(emoteStart, sentence.cursor));
      sentence.element.innerHTML += escapeHtml(leading)
        + `<img src="${escapeHtml(sentence.emotes[emoteStart])}" />`
        + escapeHtml(trailing);
    }
    // insert text
    else {
      // animate whole word
      if (this.currentState.animateDelayChar === 0 && sentence.text[sentence.cursor] !== " ") {
        // skip to next word
        const wordStart = sentence.cursor;
        this.moveCursorToSpaceOrEnd(sentence);
        sentence.element.innerHTML += escapeHtml(sentence.text.substring(wordStart, sentence.cursor));
      }
      // animate single char
      else {
        sentence.element.innerHTML += escapeHtml(sentence.text[sentence.cursor]);
        sentence.cursor ++;
      }
    }

    this.animationTimerHandle = setTimeout(() => this.stepSentenceAnimation(sentence), sentence.text[sentence.cursor] === " " ? 
      this.currentState.animateDelayWord - this.currentState.animateDelayChar :
      this.currentState.animateDelayChar) as unknown as number;
  }

  tryAnimateNextSentence() {
    if (this.isPlayingAnimation) {
      return;
    }

    const interimIndex = this.sentenceQueue.findIndex(s => !s.isAnimated); // todo cache index
    if (interimIndex !== -1) {
      // run animation
      this.stepSentenceAnimation(this.sentenceQueue[interimIndex]);
    }
  }

  // One pass over the raw text: profanity and emotes are replaced on the original words only,
  // never on HTML that was already generated. Everything else is escaped.
  buildStaticHtml(event: TextEvent): string {
    const text = event.value;
    const emotes: Record<string, string> = event.emotes ?? {};
    const maskHtml = `<span class="${event.type === TextEventType.interim ? 'interim' : ''} profanity">${escapeHtml(this.currentState.textProfanityMask)}</span>`;

    // numeric keys are cursor positions (start index of each emote word in event.value, from scanForEmotes).
    // Walk the text by index like the animated mode: this also covers the case-insensitive matches
    // and replacement words (lol -> LUL) that the emote code keys below cannot find.
    if (Object.keys(emotes).some(key => /^\d+$/.test(key))) {
      const profanityEnds = new Map<number, number>();
      for (const match of text.matchAll(new RegExp(profanityPattern, "g"))) {
        profanityEnds.set(match.index as number, (match.index as number) + match[0].length);
      }

      let cursorHtml = "";
      let i = 0;
      while (i < text.length) {
        if (profanityEnds.has(i)) {
          cursorHtml += maskHtml;
          i = profanityEnds.get(i) as number;
        }
        else if (i in emotes) {
          // skip the whole word, like moveCursorToSpaceOrEnd (always move forward)
          const spaceIndex = text.indexOf(" ", i);
          const wordEnd = Math.max(spaceIndex === -1 ? text.length : spaceIndex, i + 1);
          const [leading, trailing] = emoteWordEdges(text.substring(i, wordEnd));
          cursorHtml += escapeHtml(leading) + `<img src="${escapeHtml(emotes[i])}" />` + escapeHtml(trailing);
          i = wordEnd;
        }
        else {
          cursorHtml += escapeHtml(text[i]);
          i++;
        }
      }
      return cursorHtml;
    }

    // no cursors: match the emote codes (string keys) as whole words
    const emoteKeys = Object.keys(emotes)
      .filter(key => key)
      .sort((a, b) => b.length - a.length); // longest first

    // profanity first, then emotes as whole words (word characters are what scanForEmotes keeps)
    const patterns = [`(${profanityPattern.source})`];
    if (emoteKeys.length)
      patterns.push(`(?<!\\w)(${emoteKeys.map(escapeRegExp).join("|")})(?!\\w)`);

    let html = "";
    let last = 0;
    for (const match of text.matchAll(new RegExp(patterns.join("|"), "g"))) {
      const start = match.index as number;
      html += escapeHtml(text.substring(last, start));
      html += match[1] !== undefined ? maskHtml : `<img src="${escapeHtml(emotes[match[2]])}" />`;
      last = start + match[0].length;
    }
    return html + escapeHtml(text.substring(last));
  }

  enqueueSentence(event: TextEvent) {
    if (!this.currentState.sourceInterim && event?.type === TextEventType.interim) {
      return;
    }

    // insert animated text
    if (this.currentState.animateEnable) {
      // ignore interim
      if (event.type === TextEventType.interim) {
        return;
      }

      const sentenceState: SentenceState = {
        type: event.type,
        element: document.createElement("span"),
        text: event.value,
        cursor: 0,
        cursorProfanity: 0,
        profanityCursorList: {},
        isAnimated: false,
        emotes: event.emotes ?? {}
      }

      // find profanity
      const maskedValue = event.value.matchAll(new RegExp(profanityPattern, "gi"));
      for(let v of maskedValue) {
        sentenceState.profanityCursorList[v.index as number] = true;
      }

      this.sentenceQueue.push(sentenceState);
      this.textElement.insertBefore(sentenceState.element, this.textEndElement);
      this.tryAnimateNextSentence();

    }
    // insert static text
    else {
      const interimIndex = this.sentenceQueue.findIndex(s => s.type === TextEventType.interim); // todo cache index
      
      let filteredText = this.buildStaticHtml(event);

      // add space
      filteredText += " ";

      // update interim
      if (interimIndex !== -1) {

        // remove interim / drop active state
        if (event.value === "") {
          this.sentenceQueue[interimIndex].element?.remove?.();
          this.sentenceQueue.splice(interimIndex, 1);

          if (!this.sentenceQueue.length) {
            this.boxElement.classList.remove("active");
          }
          return;
        }

        const sentenceElement = this.sentenceQueue[interimIndex].element;
        this.sentenceQueue[interimIndex].type = event.type;
        if (sentenceElement) {
          sentenceElement.innerHTML = filteredText;
          // final
          if (event.type === TextEventType.final) {
            sentenceElement.classList.remove("interim");
          }
        }
      }
      else {
        // create new sentence
        const sentenceState: SentenceState = {
          type: event.type,
          element: document.createElement("span"),
          text: event.value,
          cursor: 0,
          cursorProfanity: 0,
          profanityCursorList: {},
          isAnimated: true,
          emotes: event.emotes ?? {}
        }

        this.sentenceQueue.push(sentenceState);
        sentenceState.element.innerHTML = filteredText;
        if (event.type === TextEventType.interim) {
          sentenceState.element.classList.add("interim");
        }
        this.textElement.insertBefore(sentenceState.element, this.textEndElement);
      }
      this.onActivity();
    }
    this.triggerActivity();
  }

  onResize() {
    this.scrollContainerElement.scrollTo({ top: this.scrollContainerElement.scrollHeight, behavior: "smooth" });
  }

  // build both state styles: element settings, then the custom css (with [file-id] replaced by file urls)
  applyStyles() {
    this.stateStyleElement.textContent = buildStateStyle(this.currentState);
    this.customStyleElement.textContent = CssReplaceFileReference(this.currentState.css ?? "");
  }

  // copy state for faster access
  onStateChange(){
    if (this.disposed || !this.containerElement) {
      return;
    }
    // detect changes
    const scene = window.ApiClient.scenes.state.activeScene;
    const storedState = window.ApiClient.document.fileBinder.get().elements[this.id]?.scenes[scene]?.data as Element_TextState | undefined;
    // element removed or not in this scene (yet)
    if (!storedState) {
      return;
    }
    if (this.stateApplied && fastEqual(storedState, this.currentState)) {
      return;
    }
    this.currentState = storedState;
    this.stateApplied = true;

    // update styles
    this.applyStyles();

    // rebind events
    this.bindTextEvents();

    if (this.currentState.previewMode) {
      this.boxElement.classList.add("active");
    }
    else {
      this.boxElement.classList.remove("active");
    }
  }


  bindTextEvents() {
    // primary event sub
    window.ApiShared.pubsub.unsubscribe(this.eventTextRef);
    this.eventTextRef = window.ApiShared.pubsub.subscribeText(this.currentState.sourceMain, e => e?.value && this.enqueueSentence(e));

    // kb input event sub
    window.ApiShared.pubsub.unsubscribe(this.eventTextInputRef);
    this.eventTextInputRef = window.ApiShared.pubsub.subscribeText(TextEventSource.textfield, e => e && this.enqueueSentence(e), true);
  }

  // called with the same element on every render: only the first call (or a new element) does anything
  bindContainer(containerElement: HTMLDivElement | null) {
    if (!containerElement || this.disposed) {
      return;
    }
    if (this.containerElement === containerElement) {
      return;
    }
    // bound to another element before: drop everything that belongs to it
    this.unbindContainer();

    this.containerElement = containerElement;
    this.boxElement = this.containerElement.querySelector(".box") as HTMLElement;
    this.textElement = this.containerElement.querySelector(".text") as HTMLElement;
    this.textEndElement = this.containerElement.querySelector(".text-end") as HTMLSpanElement;
    this.scrollContainerElement = this.containerElement.querySelector(".scroll-container") as HTMLElement;

    // create base style ele
    this.baseStyleElement = document.createElement("style");
    this.baseStyleElement.textContent = elementStyle;
    this.containerElement.append(this.baseStyleElement);

    // create state style ele
    this.stateStyleElement = document.createElement("style");
    this.containerElement.append(this.stateStyleElement);

    // create custom css ele
    this.customStyleElement = document.createElement("style");
    this.containerElement.append(this.customStyleElement);

    // listen for text or container sizes
    this.textObserver = new ResizeObserver(e => this.onResize());
    this.textObserver.observe(this.textElement);
    this.textObserver.observe(this.scrollContainerElement);
    
    // subscribe to store updates
    this.sceneChangeEventCancelToken = subscribe(window.ApiClient.scenes.state, () => this.onStateChange());
    this.storeEventCancelToken = window.ApiClient.document.fileBinder.subscribe(data => this.onStateChange());
    // file urls change when files are added or removed ([file-id] in css, box image)
    this.fileUrlsEventCancelToken = subscribe(window.ApiClient.files.fileUrls, () => this.stateApplied && this.applyStyles());

    this.onStateChange();
  }

  // remove styles, observer, subscriptions and timers of the current container
  unbindContainer() {
    clearTimeout(this.activityTimerHandle);
    clearTimeout(this.activityTimerDelayClearHandle);
    clearTimeout(this.animationTimerHandle);
    this.isPlayingAnimation = false;
    this.clearSentences();

    this.textObserver?.disconnect();
    this.textObserver = undefined;
    this.sceneChangeEventCancelToken?.();
    this.sceneChangeEventCancelToken = undefined;
    this.storeEventCancelToken?.();
    this.storeEventCancelToken = undefined;
    this.fileUrlsEventCancelToken?.();
    this.fileUrlsEventCancelToken = undefined;
    window.ApiShared.pubsub.unsubscribe(this.eventTextRef);
    this.eventTextRef = undefined;
    window.ApiShared.pubsub.unsubscribe(this.eventTextInputRef);
    this.eventTextInputRef = undefined;

    this.baseStyleElement?.remove();
    this.stateStyleElement?.remove();
    this.customStyleElement?.remove();

    this.containerElement = undefined;
    this.stateApplied = false;
  }

  dispose() {
    this.disposed = true;
    this.unbindContainer();
  }
}
// state.previewMode
const Element_Text: FC<{ id: string }> = memo(({ id }) => {
  const [controller] = useState(() => new TextController(id));
  const {activeScene} = useSnapshot(window.ApiClient.scenes.state);
  const state = useGetState(state => (state.elements[id].scenes[activeScene].data as Element_TextState));

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  // stable ref: an inline function would rebind (and rebuild styles, observers, subscriptions) on every render
  const bindContainer = useCallback((ele: HTMLDivElement | null) => controller.bindContainer(ele), [controller]);

  return <div className="container" ref={bindContainer}>
    <div className="box">
      <div className="scroll-container">
        <div className="text-container">
          <span className="text">
            {state.previewMode && <span>This is <span className="profanity">{state.textProfanityMask || '***'}</span> test! <span className="interim">This is interim test</span> </span>}
            <span className="text-end"></span>
          </span>
        </div>
      </div>
    </div>
  </div>
});
export default Element_Text;