# Background music

Drop a single looping track in this folder named `bg.mp3` (or `bg.ogg`).
The audio engine (`src/lib/audio.ts`) lazily loads it when the user
enables Music in Settings; missing file is silent.

Recommendations:
- 1–3 minute loop, seamless start↔end so the loop is invisible.
- Keep it tasteful and quiet under the SFX — the user can drop volume
  in Settings but most won't bother.
- Format: stereo 128–192 kbps MP3 is a good balance of size and quality.

Multiple-track support (e.g. menu vs. match music) can be layered on
later — `audio.ts` is structured so adding a second slot is one entry
in the file map.
