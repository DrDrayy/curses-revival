# OBS overlay

This puts your captions on your stream or recording. It works with OBS Studio.

## Add the overlay

1. In curses, open the **OBS Studio** tab (first section: **Browser source captions**).
2. Press **Copy browser source url**. The link is copied. By default it looks like `localhost:3030/client`. The number is the port. 3030 is the default.
3. In OBS, add a new **Browser** source.
4. Paste the link into the **URL** box. If OBS does not accept it, put `http://` in front: `http://localhost:3030/client`.
5. Set the width and height to your canvas size. The OBS tab tells you the numbers. The default is 500x300. You can change the canvas size in the **Canvas and scenes** tab.
6. Press OK. Say something. The caption should appear.

Keep curses open while you stream. The overlay is served by the app itself.

## Change how captions look

Add a text element in curses and change its colors, font, shadow, background and animation. The element has a **CSS** box for your own styles. In this fork the CSS box works (in the original it did nothing).

## OBS native stream captions (optional)

OBS can also send captions to the stream player (the little "CC" button).

1. In the **OBS Studio** tab, go to **Websocket connection**. Tick **Auto connect** or press **Connect**. OBS needs the obs-websocket plugin turned on (OBS 28 and newer have it). Fill in the port and password to match OBS.
2. Under **Native stream captions**, tick **Enable**.

In this fork, **Enable** is really respected. If you used native captions before, tick it once.

## If it does not work

See [Troubleshooting](troubleshooting.md).
