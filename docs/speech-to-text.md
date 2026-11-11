# Speech to text

Open the **Speech to text** tab. Pick a **Service**, fill in what it asks for, and press **Start**.

## Services

| Service | Needs | Notes |
|---|---|---|
| **Native** | Nothing | Uses the speech recognition of the app's built-in browser engine. Pick a language and dialect. If it does not work on your PC, use **Browser**. |
| **Browser** | Chrome or Edge | Press **Open Chrome** or **Open Edge**. A page opens that listens to your mic. Keep it open. |
| **Azure** | An Azure Speech key | Fill in **Key** and **Location**, pick a language. |
| **Deepgram** | A Deepgram API key | Fill in **Key**, pick a language and a model. |

Speechly used to be in the list. It was discontinued and is removed.

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
