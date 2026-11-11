import { invoke } from "@tauri-apps/api/tauri";

export function sendOsc(path: string, args: any[]) {
  invoke("plugin:osc|send", {
    rpc: {
      path,
      args,
    },
  });
}

/**
 * Splits text into pieces of at most `maxLength` characters (unicode code points, not UTF-16 units).
 * Cuts at spaces when possible, long words are cut hard.
 */
export function splitText(text: string, maxLength: number): string[] {
  const chars = Array.from(text);
  if (chars.length <= maxLength)
    return [text];

  const isSpace = (c: string) => /\s/.test(c);
  const result: string[] = [];
  let start = 0;
  while (start < chars.length) {
    while (start < chars.length && isSpace(chars[start]))
      start++;
    if (start >= chars.length)
      break;

    let end = Math.min(start + maxLength, chars.length);
    if (end < chars.length) {
      // last space inside the window (or right after it)
      for (let i = end; i > start; i--) {
        if (isSpace(chars[i])) {
          end = i;
          break;
        }
      }
    }
    result.push(chars.slice(start, end).join("").trimEnd());
    start = end;
  }
  return result;
}
