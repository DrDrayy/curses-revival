import { zSafe, zStringNumber } from "@/utils";
import { z } from "zod";

export enum STT_Backends {
  native = "native",
  browser = "browser",
  azure = "azure",
  deepgram = "deepgram",
  speechly = "speechly",
}

export const zodSTT_Backends = z.nativeEnum(STT_Backends);

export const Service_STT_Schema = z.object({
  backend: zSafe(zodSTT_Backends, STT_Backends.native),
  autoStart: zSafe(z.coerce.boolean(), false),
  uwu: zSafe(z.coerce.boolean(), false),
  stopWithStream: zSafe(z.coerce.boolean(), false),
  replaceWords: zSafe(z.record(z.coerce.string(), z.coerce.string()), {}),
  replaceWordsIgnoreCase: zSafe(z.coerce.boolean(), false),
  replaceWordsPreserveCase: zSafe(z.coerce.boolean(), false),
  // one word or phrase per line, sent to the service as a hint for rare words and names
  customWords: zSafe(z.coerce.string(), ""),
  // how long a pause ends a sentence, in ms; empty = the service default
  sentencePauseMs: zSafe(z.coerce.string(), ""),
  native: z.object({
    language_group: zSafe(z.coerce.string(), ""),
    language: zSafe(z.coerce.string(), ""),
  }).default({}),
  azure: z.object({
    device: zSafe(z.coerce.string(), "default"),
    language_group: zSafe(z.coerce.string(), ""),
    language: zSafe(z.coerce.string(), ""),
    secondary_language_group: zSafe(z.coerce.string(), ""),
    secondary_language: zSafe(z.coerce.string(), ""),
    use_secondary_language: zSafe(z.coerce.boolean(), true),
    key: zSafe(z.coerce.string(), ""),
    location: zSafe(z.coerce.string(), ""),
    profanity: zSafe(z.coerce.string(), "masked"),
    silenceTimeout: zSafe(zStringNumber(), "20"),
    interim: zSafe(z.coerce.boolean(), true),
  }).default({}),
  speechly: z.object({
    device: zSafe(z.coerce.string(), ""),
    key: zSafe(z.coerce.string(), ""),
  }).default({}),
  deepgram: z.object({
    device: zSafe(z.coerce.string(), "default"),
    language_group: zSafe(z.coerce.string(), ""),
    language: zSafe(z.coerce.string(), ""),
    tier: zSafe(z.coerce.string(), ""), // old setting, no longer sent; kept so old saves parse
    model: zSafe(z.coerce.string(), "nova-3"),
    key: zSafe(z.coerce.string(), ""),
    punctuate: zSafe(z.coerce.boolean(), true),
    profanity: zSafe(z.coerce.boolean(), true),
    interim: zSafe(z.coerce.boolean(), true),
  }).default({})
}).default({});

// custom words: one per line, trimmed, no empty lines or duplicates, at most `max`
export function parseCustomWords(text: string | undefined, max: number): string[] {
  const words: string[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    const w = line.trim();
    if (w && !words.includes(w))
      words.push(w);
    if (words.length >= max)
      break;
  }
  return words;
}

// pause setting as a whole number clamped to min..max, or undefined when empty/invalid
export function parsePauseMs(text: string | undefined, min: number, max: number): number | undefined {
  const s = (text ?? "").trim();
  if (!/^\d+$/.test(s))
    return undefined;
  return Math.min(max, Math.max(min, parseInt(s, 10)));
}

export type STT_State = z.infer<typeof Service_STT_Schema>;
