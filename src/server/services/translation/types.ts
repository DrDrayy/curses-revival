import { TextEvent } from "@/types";
import { Translation_State } from "./schema";

export interface ITranslationReceiver {
  onStart(): void,
  onStop(error?: string): void,
  onTranslation(id: number, e: TextEvent, value: string): void;
}

export interface ITranslationServiceConstructor {
  new (receiver: ITranslationReceiver): ITranslationService;
}

export interface ITranslationService {
  start(params: Translation_State): void;
  stop(): void;
  // false if nothing was sent (e.g. interim text is turned off)
  translate(id: number, value: TextEvent): boolean;
  dispose(): void;
}
