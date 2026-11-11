import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/tauri";

type Level = "error" | "warn" | "info";

const MAX_LINES_PER_MINUTE = 50;
const MAX_LENGTH = 4000;

let installed = false;
let busy = false; // recursion guard
let windowStart = 0;
let windowCount = 0;
let throttleNoted = false;

// Logs may be sent to other people, so anything that looks like a secret is removed before sending.
export function redact(text: string): string {
  return text
    .replace(/\b(Bearer|OAuth)\s+\S+/gi, "$1 [hidden]")
    .replace(/(token|key|secret|password|authorization)(["']?\s*[=:]\s*|\s+)("[^"]*"|'[^']*'|[^\s,;&"']+)/gi, "$1$2[hidden]")
    .replace(/[A-Za-z0-9_\-]{24,}/g, "[hidden]");
}

function formatArg(x: unknown): string {
  try {
    if (x instanceof Error) {
      return `${x.name}: ${x.message}${x.stack ? "\n" + x.stack : ""}`;
    }
    if (x === null || x === undefined || typeof x !== "object") return String(x);
    if (Array.isArray(x)) return "[object]";
    const s = String(x);
    return s === "[object Object]" ? "[object]" : s;
  } catch {
    return "[object]";
  }
}

function send(level: Level, message: string) {
  try {
    invoke("plugin:log|write", { level, message }).catch(() => {});
  } catch {
    // ignore
  }
}

export function logLine(level: Level, message: string) {
  if (busy || !window.__TAURI_IPC__) return;
  busy = true;
  try {
    const now = Date.now();
    if (now - windowStart >= 60000) {
      windowStart = now;
      windowCount = 0;
      throttleNoted = false;
    }
    windowCount++;
    if (windowCount > MAX_LINES_PER_MINUTE) {
      if (!throttleNoted) {
        throttleNoted = true;
        send("warn", "log throttled: more than 50 lines in a minute, the rest are dropped");
      }
      return;
    }
    send(level, redact(String(message)).slice(0, MAX_LENGTH));
  } catch {
    // ignore
  } finally {
    busy = false;
  }
}

export function installErrorLog() {
  if (installed || typeof window === "undefined" || !window.__TAURI_IPC__) return;
  installed = true;

  window.addEventListener("error", (e) => {
    const where = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : "";
    logLine("error", `${e.error ? formatArg(e.error) : e.message}${where}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logLine("error", `unhandled rejection: ${formatArg(e.reason)}`);
  });

  for (const level of ["error", "warn"] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      original.apply(console, args);
      try {
        logLine(level, args.map(formatArg).join(" "));
      } catch {
        // ignore
      }
    };
  }

  getVersion()
    .catch(() => "unknown")
    .then((v) => logLine("info", `curses ${v} started ${navigator.userAgent}`));
}
