# Troubleshooting

## Find the log

1. Open **Settings**.
2. Press **Open log folder**.
3. Open `curses.log`.

Tokens and keys are hidden in the log. Still, check what you share. When you report a problem, paste the lines from around the time it happened.

## Windows says "Windows protected your PC" (SmartScreen)

The program is not signed, so Windows warns about it. If you downloaded it from this repository's Releases or Actions page, press **More info**, then **Run anyway**. If you are not sure where your file came from, do not run it.

## OBS native captions do not show

Open the **OBS Studio** tab, find **Native stream captions** and tick **Enable**. In this fork, captions are only sent when this box is ticked. The OBS connection must also be **Connected**.

## The overlay in OBS is empty

- Keep curses open. It serves the overlay.
- Check that the link and the port match (default 3030). If you start curses with another port, the link changes. Copy it again.
- Set the browser source size to your canvas size.
- If OBS does not take the link, add `http://` in front.

## VRChat shows nothing

- Is OSC enabled? **Action Menu > Options > OSC > Enabled**.
- In the **VRChat chatbox** tab, is **Enable** ticked? Does **Send test** work?
- Features build: if **Pause chatbox while AFK** is on and you are AFK, nothing is sent on purpose.

## Port 9001 is busy (features build)

Only one app can listen on port 9001, VRChat's default OSC output port. Another OSC app may have it. Close that app, then untick and tick **Pause chatbox while AFK** again. Or turn the option off.

## Deepgram gives a language error with Nova-3

Not every language works with Nova-3. In the **Speech to text** tab, change **Model** to **Nova-2 (more languages)**.

## Twitch Login does nothing

- Features build: enter your **Twitch Client ID** first. See [Twitch](twitch.md). The redirect URL in your Twitch app must be exactly `http://localhost:3030/oauth_twitch.html`.
- Fixes build: login only works if the build had a Client ID built in. Use the features build.

## Settings are gone after switching builds

Going from the features build to the fixes build can drop the settings that only exist in features (like custom words or the Twitch Client ID). Write them down before you switch. Going from fixes to features keeps your settings.

If a settings file cannot be read, the app keeps a copy named like `settings.<number>.bak` in its data folder.

## Still stuck

[Open an issue](../../issues/new/choose) and attach lines from `curses.log`.
