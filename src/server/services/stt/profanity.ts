import { profanityList } from "./profanity_list";

export type ProfanityFilterOptions = {
  sexual: boolean,
  extra: string[],
};

export type ProfanityFilter = (text: string) => string;

const noFilter: ProfanityFilter = text => text;

// escape the characters that mean something in a regexp (the "u" flag allows no other escapes)
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
}

function buildRegExp(opts: ProfanityFilterOptions): RegExp | undefined {
  const sources = new Set<string>();
  const lengths = new Map<string, number>();
  const add = (source: string, length: number) => {
    if (!source || sources.has(source))
      return;
    sources.add(source);
    lengths.set(source, length);
  };

  for (const entry of profanityList) {
    if (entry.severity < 2)
      continue;
    if (entry.tags.includes("sexual") && !opts.sexual)
      continue;
    for (const alt of entry.match.split("|")) {
      const word = alt.trim().toLowerCase();
      if (!word)
        continue;
      // in the list "X*" means "one or more X"
      add(escapeRegExp(word).replace(/\\\*/g, "+"), word.length);
    }
  }

  // the user's own words are matched as typed, a "*" in them is just a "*"
  for (const line of opts.extra) {
    const word = (line ?? "").trim();
    if (word)
      add(escapeRegExp(word), word.length);
  }

  if (!sources.size)
    return undefined;

  // longest first, so a longer phrase wins over a word inside it
  const list = [...sources].sort((a, b) => (lengths.get(b) ?? 0) - (lengths.get(a) ?? 0));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${list.join("|")})(?:s|es|ed|er|ers|ing|in)?(?![\\p{L}\\p{N}_])`, "giu");
}

let cacheKey = "";
let cacheFilter: ProfanityFilter | undefined;

// returns a function that masks swears and slurs with asterisks (one per letter);
// the last filter is kept, so calling it again with the same options is cheap
export function buildProfanityFilter(opts: { sexual: boolean, extra: string[] }): ProfanityFilter {
  try {
    const extra = (opts?.extra ?? []).map(w => String(w ?? "").trim()).filter(w => !!w);
    const options: ProfanityFilterOptions = { sexual: !!opts?.sexual, extra };
    const key = JSON.stringify(options);
    if (cacheFilter && key === cacheKey)
      return cacheFilter;

    const regexp = buildRegExp(options);
    const filter: ProfanityFilter = !regexp ? noFilter : (text: string) => {
      try {
        if (typeof text !== "string" || !text)
          return text;
        // every letter becomes "*", spaces in a phrase stay, so it reads as masked words
        return text.replace(regexp, v => v.replace(/\S/gu, "*"));
      } catch {
        return text;
      }
    };
    cacheKey = key;
    cacheFilter = filter;
    return filter;
  } catch {
    return noFilter;
  }
}

// one word per line, the same way the settings text area stores them
export function parseProfanityExtra(text: string | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map(w => w.trim()).filter(w => !!w);
}
