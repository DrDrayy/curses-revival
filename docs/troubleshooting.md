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

## Speech to text says "network", or stops after a while (Native)

**Native** does not recognise speech on your PC. It sends your voice to Microsoft's online speech service through the app's built-in browser, and "network" means that trip failed. This is almost always on Microsoft's side, not your internet: the browser built into apps often cannot reach that service, and Microsoft's speech service has been unreliable in Edge too.

- Switch **Service** to **Browser** and press **Open Chrome**. Chrome uses Google's speech service, which is usually reliable. Keep the Chrome tab open while you stream.
- **Open Edge** uses the same Microsoft service as Native, so it can fail the same way.
- For the most reliable results, use **Deepgram** or **Azure**. Both need a free account and a key, give some free use to start with, and then charge (see [Speech to text](speech-to-text.md)).
- If Chrome fails too, check whether a firewall, VPN or antivirus blocks the browser.

## Deepgram gives a language error with Nova-3

Not every language works with Nova-3. In the **Speech to text** tab, change **Model** to **Nova-2 (more languages)**.

## Twitch Login does nothing

- Features build: enter your **Twitch Client ID** first. See [Twitch](twitch.md). The redirect URL in your Twitch app must be exactly `http://localhost:3030/oauth_twitch.html`.
- Fixes build: login only works if the build had a Client ID built in. Use the features build.

## Settings are gone after switching builds

Going from the features build to the fixes build can drop the settings that only exist in features (like custom words or the Twitch Client ID). Write them down before you switch. Going from fixes to features keeps your settings.

If a settings file cannot be read, the app keeps a copy named like `settings.<number>.bak` in its data folder.

## Still stuck

[Open an issue](../../../issues/new/choose) and attach lines from `curses.log`.
