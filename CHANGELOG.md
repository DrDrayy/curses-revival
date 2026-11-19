# Changelog

All notable changes to this fork of [curses by mmpneo](https://github.com/mmpneo/curses). Based on the original at its last commit (June 2024). Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.3] - 2026-11-19

### Fixed (both builds)
- The browser speech page (Chrome or Edge) sends live text to curses at once. It used to drop updates for 0.4 seconds after each one, so captions lagged behind the in-app services.

## [0.1.2] - 2026-11-19

### Fixed (both builds)
- Native speech-to-text no longer stops at the first "network" error from Microsoft's speech service. It tries again (after 1, 2, 4, 8 and 10 seconds) and only stops after six failures in a row, with a message that suggests Browser with Chrome, Deepgram or Azure.

### Added (features build)
- **Google (free, via Chrome)**, the old Browser service: pick the language in curses and press **Start in Chrome**. A small Chrome window opens and starts listening by itself.
- **Offline mode** for it: with **Offline (on this PC, Chrome 139 or newer)** ticked, Chrome recognises speech on your own PC (no "network" errors). It uses Google's online service by itself when offline is not available.
- Native is called **Microsoft (free, not reliable)** in the features build.

### Changed (both builds)
- Native is now called "Native (not reliable)" in the service list.
- The troubleshooting and speech-to-text guides explain the Native "network" error.

## [0.1.1] - 2026-11-12

### Changed
- The app now shows its real version (0.1.1) in Settings.
- The `-features` release is marked as the latest release, and release notes say which file and build to pick.
- In Settings, the original author's links are labelled as theirs. For help with this version, see where you downloaded it.
- The README starts with the download link and who the program is for.

### Fixed
- The "Open an issue" link in the troubleshooting guide.

### Added
- A feature request form, a security policy (SECURITY.md), a contributing guide (CONTRIBUTING.md) and a code of conduct.
- A "how it works" picture in the README, and a social preview picture (`docs/images/social-preview.png`).

### Removed
- Leftover sample test files from the original project.

## [0.1.0] - 2026-11-11

First release. Two builds: **fixes** and **features** (features contains everything in fixes).

### Fixed (both builds)

#### Security
- The built-in local web server now only accepts browser pages from this PC or your local network. Before, any web page you opened could read your captions.
- Caption text is no longer run as code in the OBS overlay or in the app window. Text like `a<b>c` now shows correctly.
- The helper pages `mic.html` and `inputfield.html` no longer run injected code.
- The Twitch login token is only posted to the app's own window.
- The "open browser" action is now checked before it runs.

#### Stability
- A word replacement like `c++` or `:(` no longer causes a blank window on every start. Words that start or end with a symbol now match.
- The "port not available" message no longer shows garbage or crashes.
- A failed send to VRChat no longer crashes the app.
- Audio device problems no longer freeze the text-to-speech queue.
- The app now opens when you have no network.
- A failed start of the local server no longer uses up a whole CPU core.
- The app no longer overwrites your saved settings when the settings file cannot be read. It makes a backup copy first.
- Clients that disconnect at a bad moment no longer lock others out until you restart.
- Several small memory leaks were fixed (extra styles, mouse listeners and connection listeners piling up), so long streams stay smooth.
- Linking to another app no longer drops a connection that just worked.

#### VRChat
- The "typing..." bubble no longer gets stuck.
- Messages are sent from any free port instead of the fixed port 3400.
- Line breaks are flattened, because the chatbox only shows 9 lines.
- Long messages are split at the 144-character limit of the chatbox.
- The KillFrenzy avatar text no longer gets stuck as "busy".

#### OBS
- OBS native stream captions now obey the **Enable** box in the OBS tab.
- The app waits between tries when OBS is closed, instead of reconnecting in a tight loop.

#### Twitch
- A short network drop no longer logs you out and erases your saved login.
- Twitch chat posts over 500 characters are split into several posts.
- If one emote list fails to load, the others still load.
- Numbers in your text are no longer turned into emotes.
- Symbols around emotes are kept.
- The login listener no longer doubles up and makes duplicate connections.

#### Speech-to-text
- Azure no longer needs a second language when "Enable secondary language" is off.
- Deepgram's profanity filter setting is now really sent.
- Deepgram and the settings panel now release the microphone after an error or when you stop.
- Translation results are no longer dropped as "old".
- Speechly is removed from the service list (see Removed).

#### Text-to-speech
- Uberduck no longer uses one fixed audio device that most PCs do not have.
- Windows voice speed below 1x now works correctly.
- Azure voice no longer breaks on text with `&` or `<`.
- The built-in voice (Native) no longer loses or repeats queued lines.
- A volume of 0 is now silent instead of full volume. Sounds also stay working after a reload.
- Empty speed or pitch fields now fall back to the default.

#### Captions overlay
- A typing animation loop that never ended with some emote positions is fixed.
- The box-shadow **Spread** field changes spread (it changed blur before), and it is now labelled "Spread" instead of "Blur".
- The background image **Left** value is now used.
- Fonts with spaces in their names now work.
- An empty profanity mask no longer prints "undefined".
- The caption box no longer rebuilds itself on every setting change, so old styles do not stay behind.
- The text element's custom CSS box now works.

#### Editor
- Typing in the overlay text box is no longer one key behind. An empty box no longer sends a blank caption.
- Hotkeys no longer stop working after you record a duplicate shortcut, and cleared shortcuts really stop working.
- Clearing a number field no longer saves "not a number".
- Added files get the right type and name, and removing a font no longer deletes the wrong files.
- Elements whose internal ID contains a "-" no longer break CSS event bindings.

### Added (both builds)
- An error log. Open it with **Settings > Open log folder**; the file is `curses.log`. Tokens and keys are hidden.
- Automatic Windows builds on GitHub (the `curses-fixes` and `curses-features` downloads).

### Added (features build)
- A switch for the VRChat chatbox notification sound (**Play chatbox sound**).
- Pause the chatbox while you are AFK in VRChat. Uses the VRChat OSC output (port 9001 by default).
- Your own Twitch Client ID, typed into the Twitch tab.
- Deepgram Nova-3 and Nova-2 models.
- Custom words for Azure and Deepgram.
- A sentence pause setting in milliseconds for Azure and Deepgram.
- Hotkeys to start or stop speech-to-text, mute the mic, and mute sound effects.

### Changed
- OBS native stream captions are off until you tick **Enable** in the OBS tab. Tick it once after updating.
- The local web server only accepts pages from this PC or your local network.
- Going from the features build back to the fixes build can drop the settings that only exist in features.
- Twitch login in the fixes build only works if the build was made with a Twitch Client ID built in. The features build asks you for your own.

### Removed
- Speechly is gone from the speech-to-text list, because the service was discontinued.

### Known issues
- A Google Fonts API key is still written into the code, as in the original. It was left as is.
- This is a first release and few people have tested it. Please report problems.
