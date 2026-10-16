# Inside the Direct Message context we want the user to be able to intiate a video and voice call.

- Add a new button to the DM pane (top next to title of pane) This starts a video call.
- Ringing is a slow repeating, `beep()`, and can be turned off in the settings (next to join/leave sounds toggle).
- DM pane gets an horizontal split, with the top 3/4ths being the video call UI and the text gets shrunk to the bottom 1/4th left.
- A video/voice call is just another livekit track, so most of the changes are going to be on the frontend, camera support, new setting, changes to the DM pane.
- The ringing needs backend changes so we can propagate a ring event.

## Some edge cases

- Starting a DM video call while the audio is being used in a voice channel exits the voice channel. (only on audio/video track at a time).

Follow the golden rule, re-use the existing style system/components.

## Verify your changes

- Use `agent-browser` and the local dev container.

Go!
