import { ProfanityEntry, profanityList } from "./profanity_list";

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

// in the list "X*" means "one or more X"
function listSource(word: string) {
  return escapeRegExp(word).replace(/\\\*/g, "+");
}

// words of the list that are also everyday words, or words people use for themselves: never masked
const SKIP = new Set([
  "poof", "pansy", "twink", "switch hitter", "gym bunny", "gymbunny", "enby", "cishet",
  "negro", "haji", "hajj*i", "hadji", "swastika", "svastika", "suastika", "neonazi", "neo-nazi", "neo nazi",
  "finocchio", "finochio", "finoccio",
]);

// common words the list misses (not from the list)
const ADDITIONS: ProfanityEntry[] = [
  { match: "slut|dickhead|dumbass|jackass", severity: 3, tags: ["general"] },
  { match: "raped|raping|rapist|rapists", severity: 4, tags: ["violence"] },
];

// listed as sexual words, but they are about violence: masked whenever the filter is on
const NOT_SEXUAL = new Set(["rape", "date rape", "daterape"]);

// a word with one of these inside is masked whole: motherfucker, clusterfucks, shitshow, bullshitting ...
const ROOTS = ["fu+c+k", "sh+i+t"];
// ... except these ordinary words
const ROOT_EXCEPTIONS = new Set([
  "mishit", "mishits", "mishitting", "shiitake", "shiitakes", "shitake", "shitakes", "shittah", "shittahs", "shittim",
  "shiite", "shiites",
]);

// everyday swears also match their usual endings: bitches, bastards, wankers, retarded, shitty
function swearSources(word: string): string[] {
  const stem = listSource(word);
  const sources = [`${stem}(?:s|es|ed|er|ers|ing|in|y)?`];
  const last = word[word.length - 1];
  // the last letter doubled: shitting, twatted
  if ("bdgmnpt".includes(last))
    sources.push(`${stem}${last}(?:ing|in|ed|er|ers|y)`);
  // a silent "e": whored, whoring
  if (last === "e" && word.length > 2)
    sources.push(`${stem}(?:d|r|rs)`, `${listSource(word.slice(0, -1))}(?:ing|in)`);
  return sources;
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

  for (const entry of [...profanityList, ...ADDITIONS]) {
    if (entry.severity < 2)
      continue;
    for (const alt of entry.match.split("|")) {
      const word = alt.trim().toLowerCase();
      if (!word || SKIP.has(word))
        continue;
      if (entry.tags.includes("sexual") && !opts.sexual && !NOT_SEXUAL.has(word))
        continue;
      // slurs and sexual words match as listed or with a plural "s" only, so their endings don't hit
      // ordinary words (spic: spiced, spices; cum: cumin; cock: cocker)
      if (entry.tags.includes("general"))
        swearSources(word).forEach(source => add(source, word.length));
      else
        add(`${listSource(word)}s?`, word.length);
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

  // longest first, so a longer phrase wins over a word inside it; the roots last, for the same reason
  const list = [...sources].sort((a, b) => (lengths.get(b) ?? 0) - (lengths.get(a) ?? 0));
  const roots = ROOTS.map(root => `[\\p{L}\\p{N}_]*${root}[\\p{L}\\p{N}_]*`);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...list, ...roots].join("|")})(?![\\p{L}\\p{N}_])`, "giu");
}

let cacheKey = "";
let cacheFilter: ProfanityFilter | undefined;

// returns a function that masks swears and slurs with asterisks (one per letter, at least two a word);
// the last filter is kept, so calling it again with the same options is cheap
export function buildProfanityFilter(opts: { sexual: boolean, extra: string[] }): ProfanityFilter {
  try {
    const extra = (opts?.extra ?? []).map(w => String(w ?? "").trim()).filter(w => !!w);
    const options: ProfanityFilterOptions = { sexual: !!opts?.sexual, extra };
    const key = JSON.stringify(options);
    if (cacheFilter && key === cacheKey)
      return cacheFilter;

    const regexp = buildRegExp(options);
    // an ordinary word the user put in their own list is masked after all
    const ownWords = new Set(extra.map(w => w.toLowerCase()));
    const keep = new Set([...ROOT_EXCEPTIONS].filter(w => !ownWords.has(w)));
    const filter: ProfanityFilter = !regexp ? noFilter : (text: string) => {
      try {
        if (typeof text !== "string" || !text)
          return text;
        // every letter becomes "*", spaces in a phrase stay, so it reads as masked words; at least "**"
        // a word, so text-to-speech skips every part of it (it drops words with "**" in them)
        return text.replace(regexp, v => keep.has(v.toLowerCase())
          ? v
          : v.replace(/\S+/gu, w => "*".repeat(Math.max(2, Array.from(w).length))));
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
