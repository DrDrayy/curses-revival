# Speech to text

Open the **Speech to text** tab. Pick a **Service**, fill in what it asks for, and press **Start**.

## Services

| Service | Needs | Notes |
|---|---|---|
| **Native (not reliable)**, called **Microsoft (free, not reliable)** in the beta build | Nothing | Sends your voice to Microsoft's online speech service through the app's built-in browser. That service often fails with a "network" error. curses retries for about 25 seconds, then stops with a message (see [Troubleshooting](troubleshooting.md)). If it keeps happening, use **Browser** / **Chrome or Edge**. |
| **Browser**, called **Chrome or Edge (free)** in the beta build | Chrome (or Edge) | Fixes build: press **Open Chrome** or **Open Edge**, and a page opens that listens to your mic. Beta build: pick a language and press **Start in Chrome** or **Start in Edge**. A small window opens and starts listening by itself (see below). Keep the window open while you stream. Chrome is the more reliable choice: Edge uses the same Microsoft service as Native. |
| **Azure** | An Azure Speech key | Fill in **Key** and **Location**, pick a language. |
| **Deepgram** | A Deepgram API key | Fill in **Key**, pick a language and a model. |

Speechly used to be in the list. It was discontinued and is removed.

## Chrome or Edge (free): one click and offline mode (beta build)

1. Pick **Chrome or Edge (free)** as the service and choose your language.
2. Optional: tick **Offline (on this PC, Chrome 139 or newer)**. Chrome then recognises your speech on your own PC, with no trip to the internet, so no "network" errors.
3. Press **Start in Chrome (Google)** or **Start in Edge (Microsoft)**. A small window opens and starts listening. The first time, the browser asks to use your microphone: allow it.

Chrome uses Google's speech service, Edge uses Microsoft's. Edge filters swears by itself; with Chrome, use the swear filter below.

The window shows a status line: **Offline (on this PC)**, or **Online (Google)** / **Online (Microsoft)** with the reason offline was not used. Offline needs Chrome 139 or newer and does not cover every language. When it is not available, the window uses Google's online service by itself. If it says the offline model is not downloaded yet, press **Download offline speech model** in that window.

## API keys

Azure and Deepgram are online services. You make an account on their website and get a key. They may charge money after a free allowance. Paste the key into the **Key** box. Keys are saved on your PC. Never share them. They are hidden from the error log.

## Useful options

- **Enable interim results** shows text while you are still talking.
- **Edit word replacements** swaps words (for example fixing a name). Symbols like `c++` now work.
- **Start automatically** and **Stop with twitch stream**.
- **Azure**: you do not need a secondary language unless **Enable secondary language** is on.

## Beta build only

These appear in the **Speech to text** tab.

- **Custom words**: one word per line. Names and special words the service should recognise better. Works with Azure and Deepgram only.
- **Sentence pause (ms)**: how long a silence ends a sentence. A lower number gives faster captions. A higher number gives fewer split sentences. Leave it empty for the default. Works with Azure and Deepgram only.
- **Deepgram model**: pick **Nova-3 (most accurate)** or **Nova-2 (more languages)**. The old **Enhanced** and **Base** models are still there. If your language does not work with Nova-3, pick Nova-2.
- **Filter swears and slurs**: masks swears and slurs, whatever service you use, including Chrome: as `****` in the VRChat chatbox and Twitch chat, with the caption's own mask in the OBS overlay (`[redacted]` by default, see **Profanity mask** in the text element), and text-to-speech skips them. Mild words like hell, damn or crap are not masked. **Also filter sexual words** adds those. **Extra words to filter** takes your own words, one per line, matched exactly as you type them (put other forms, like plurals, on their own lines). The word list is the open [profanity-list by David Sojevic](https://github.com/dsojevic/profanity-list) (MIT license).
- **Hotkeys** (in **Settings**): **Start / stop speech to text**, **Mute / unmute mic**, **Mute / unmute sound effects**. Click the field and press your keys.
