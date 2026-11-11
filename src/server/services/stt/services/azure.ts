import {
  ISTTReceiver,
  ISTTService
} from "../types";

import {
  AudioConfig,
  AutoDetectSourceLanguageConfig,
  CancellationErrorCode,
  LanguageIdMode,
  PhraseListGrammar,
  PropertyId,
  SpeechConfig,
  SpeechRecognizer,
} from "microsoft-cognitiveservices-speech-sdk";
import { isEmptyValue } from "../../../../utils";
import { parseCustomWords, parsePauseMs, STT_State } from "../schema";

export class STT_AzureService implements ISTTService {
  constructor(private bindings: ISTTReceiver) {}

  #instance?: SpeechRecognizer;

  dispose(): void {}

  get state() {
    return window.ApiServer.state.services.stt.data.azure;
  }

  start(state: STT_State): void {
    // ignore device for now
    const { device, secondary_language_group, secondary_language, ...rest } = this.state;
    // secondary language is optional: when it is empty only the main language is used (see langConfig below),
    // even with "use secondary language" on (its default)
    if (Object.values(rest).some(isEmptyValue))
      return this.bindings.onStop("Options missing");

    const speechConfig = SpeechConfig.fromSubscription(
      state.azure.key,
      state.azure.location
    );
    speechConfig.speechRecognitionLanguage = state.azure.language;
    speechConfig.setProperty(
      PropertyId.SpeechServiceResponse_ProfanityOption,
      state.azure.profanity
    );
    speechConfig.setProperty(
      PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
      "60000"
    );
    speechConfig.setProperty(
      PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
      ((parseInt(state.azure.silenceTimeout) || 20) * 1000).toString()
    );
    const pause = parsePauseMs(state.sentencePauseMs, 100, 5000);
    if (pause !== undefined)
      speechConfig.setProperty(PropertyId.Speech_SegmentationSilenceTimeoutMs, String(pause));
    speechConfig.enableDictation();

    const langConfig = AutoDetectSourceLanguageConfig.fromLanguages(state.azure.secondary_language && state.azure.use_secondary_language ? 
      [state.azure.language, state.azure.secondary_language] : [state.azure.language]);
    langConfig.mode = LanguageIdMode.Continuous;
    const audioConfig = AudioConfig.fromMicrophoneInput(state.azure.device);
    this.#instance = SpeechRecognizer.FromConfig(
      speechConfig,
      langConfig,
      audioConfig
    );

    // custom words: at most 200 phrases and 3200 characters in total
    const words = parseCustomWords(state.customWords, 200);
    if (words.length) {
      const grammar = PhraseListGrammar.fromRecognizer(this.#instance);
      let chars = 0;
      for (const w of words) {
        if (chars + w.length > 3200)
          break;
        grammar.addPhrase(w);
        chars += w.length;
      }
    }

    this.#instance.sessionStarted = () => this.bindings.onStart();
    this.#instance.sessionStopped = () => this.bindings.onStop();
    this.#instance.canceled = (r, e) => {
      if (e.errorCode === CancellationErrorCode.NoError) this.bindings.onStop();
      else this.bindings.onStop(`${CancellationErrorCode[e.errorCode]}`);
    };

    this.#instance.recognizing = (s, e) => {
      state.azure.interim &&
      !!e.result.text &&
      this.bindings.onInterim(e.result.text);
    }
    this.#instance.recognized = (s, e) => this.bindings.onFinal(e.result.text);
    this.#instance?.startContinuousRecognitionAsync();
  }

  stop(): void {
    this.#instance?.stopContinuousRecognitionAsync(
      () => {
        this.#instance?.close();
        this.bindings.onStop();
      },
      (err) => {
        // ignore results
      }
    );
  }
}
