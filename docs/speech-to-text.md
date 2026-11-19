# Speech to text

Open the **Speech to text** tab. Pick a **Service**, fill in what it asks for, and press **Start**.

## Services

| Service | Needs | Notes |
|---|---|---|
| **Native (not reliable)**, called **Microsoft (free, not reliable)** in the features build | Nothing | Sends your voice to Microsoft's online speech service through the app's built-in browser. That service often fails with a "network" error. curses retries for about 25 seconds, then stops with a message (see [Troubleshooting](troubleshooting.md)). If it keeps happening, use **Browser** / **Google** with Chrome. |
| **Browser**, called **Google (free, via Chrome)** in the features build | Chrome (or Edge) | Fixes build: press **Open Chrome** or **Open Edge**, and a page opens that listens to your mic. Features build: pick a language and press **Start in Chrome**. A small Chrome window opens and starts listening by itself (see below). Keep the window open while you stream. Chrome is the more reliable choice: Edge uses the same Microsoft service as Native. |
| **Azure** | An Azure Speech key | Fill in **Key** and **Location**, pick a language. |
| **Deepgram** | A Deepgram API key | Fill in **Key**, pick a language and a model. |

Speechly used to be in the list. It was discontinued and is removed.

## Google (free, via Chrome): one click and offline mode (features build)

1. Pick **Google (free, via Chrome)** as the service and choose your language.
2. Optional: tick **Offline (on this PC, Chrome 139 or newer)**. Chrome then recognises your speech on your own PC, with no trip to the internet, so no "network" errors.
3. Press **Start in Chrome**. A small Chrome window opens and starts listening. The first time, Chrome asks to use your microphone: allow it.

The window shows a status line: **Offline (on this PC)**, or **Online (Google)** with the reason offline was not used. Offline needs Chrome 139 or newer and does not cover every language. When it is not available, the window uses Google's online service by itself. If it says the offline model is not downloaded yet, press **Download offline speech model** in that window.

## API keys

Azure and Deepgram are online services. You make an account on their website and get a key. They may charge money after a free allowance. Paste the key into the **Key** box. Keys are saved on your PC. Never share them. They are hidden from the error log.

## Useful options

- **Enable interim results** shows text while you are still talking.
- **Edit word replacements** swaps words (for example fixing a name). Symbols like `c++` now work.
- **Start automatically** and **Stop with twitch stream**.
- **Azure**: you do not need a secondary language unless **Enable secondary language** is on.

## Features build only

These appear in the **Speech to text** tab.

- **Custom words**: one word per line. Names and special words the service should recognise better. Works with Azure and Deepgram only.
- **Sentence pause (ms)**: how long a silence ends a sentence. A lower number gives faster captions. A higher number gives fewer split sentences. Leave it empty for the default. Works with Azure and Deepgram only.
- **Deepgram model**: pick **Nova-3 (most accurate)** or **Nova-2 (more languages)**. The old **Enhanced** and **Base** models are still there. If your language does not work with Nova-3, pick Nova-2.
- **Hotkeys** (in **Settings**): **Start / stop speech to text**, **Mute / unmute mic**, **Mute / unmute sound effects**. Click the field and press your keys.
