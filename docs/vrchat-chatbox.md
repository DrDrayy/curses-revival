# VRChat chatbox

Your speech appears in the VRChat chatbox above your head. You can keep your VRChat mic muted.

## Set up

1. In VRChat, turn on OSC: **Action Menu > Options > OSC > Enabled**.
2. In curses, open the **VRChat chatbox** tab.
3. Tick **Enable**.
4. Under **Text source**, choose where the text comes from (usually your speech-to-text).
5. Press **Send test**. You should see "Test test test!" in the chatbox.
6. Start speech-to-text and speak.

## Good to know

- The chatbox holds 144 characters. Longer text is split into parts and sent one after another.
- Line breaks are turned into spaces, because the chatbox only shows 9 lines.
- If you talk faster than the chatbox can show, the oldest waiting parts are dropped.
- **Show indicator** shows the "typing..." bubble while you speak. In this fork it no longer gets stuck.
- Messages are sent to VRChat from any free port on your PC. VRChat itself still listens on its normal OSC port.
- The **Target** list also has KillFrenzy avatar text, for avatars that support it.

## Play chatbox sound (features build)

Under **VRC Textbox options** there is a **Play chatbox sound** box. VRChat plays a small sound when a chatbox message arrives. Untick the box for silent messages. It is on by default.

## Pause chatbox while AFK (features build)

When you are AFK in VRChat, nobody reads the chatbox. This option stops sending text until you are back.

1. Tick **Pause chatbox while AFK**.
2. A port box appears (**VRChat OSC output port**). The default is 9001. This is the port VRChat sends its data to. Leave it unless you know you changed it.
3. Look at the status line next to **VRChat:**. It says "active" when VRChat data arrives, "AFK, chatbox paused" when you are AFK, or "no data yet".

Only one app on your PC can listen on port 9001 at a time. If another OSC app uses it, you will see an error. Close the other app, or see [Troubleshooting](troubleshooting.md).
