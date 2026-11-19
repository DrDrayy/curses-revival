# Twitch

Use Twitch for emotes in your captions, for posting your captions in your chat, and for reading chat messages.

## Log in (beta build)

Each user makes their own free Twitch app. This takes a few minutes and is done once.

1. Go to <https://dev.twitch.tv/console/apps> and log in.
2. Create a new application. Any name works.
3. Set **OAuth Redirect URL** to exactly `http://localhost:3030/oauth_twitch.html`. If you changed the app port from 3030, use your port.
4. Pick a category and create it. Open the app and copy its **Client ID**.
5. In curses, open the **Twitch** tab. Paste the ID into **Twitch Client ID**.
6. Press **Login** and approve in the window that opens.

The Login button stays grey until you enter a Client ID. You do not need to share it with anyone.

## Log in (fixes build)

The fixes build has no box for the Client ID. Login only works if the build was made with a Client ID built in. The downloads from this repository may not have one. If **Login** does nothing, use the beta build.

## Post your captions in chat

After login, in the **Twitch** tab:

1. Tick **Enable chat**.
2. Tick **Post in chat**. This posts your speech-to-text or translation results in your chat.
3. Tick **Post only when live streaming** if you do not want posts while offline.
4. **Send delay(ms)** waits before each post. Use it to line chat up with your stream delay.
5. Under **Text source**, pick where the text comes from.

Twitch rejects posts over 500 characters. This fork splits long text into several posts.

## Other options

- **Use chat messages** uses your chat messages as a text source (for example for text-to-speech).
- **Emotes**: **Enable emotes in OBS captions** shows 7TV, FFZ and BTTV emotes in your captions. **Show emotes** and **Remap emotes** help you manage them.
- **Logout** is shown under your name when you are logged in.
