# Sound effects

Drop short MP3 / OGG / WAV files in this folder using the filenames below.
The audio engine (`src/lib/audio.ts`) loads each one lazily; missing files
are tolerated silently so the game still runs without any sounds at all.

| File | When it plays |
|---|---|
| `select.mp3` | Player selects a piece (cell tap that highlights a piece). |
| `move.mp3`   | Piece moves to a new square without combat. |
| `capture.mp3`| A piece is killed or damaged (kill cycle / paralyzed-under-bat / elephant chip). |
| `shield.mp3` | Butterfly shields an ally, or bat paralyzes an enemy. |
| `win.mp3`    | The viewing player wins (lion on throne or all enemy lions dead). |
| `lose.mp3`   | The viewing player loses. |

Keep them short (<1.5s) and lightweight (≤30 KB each) so a flurry of
moves doesn't stutter on slow connections. Format: 44.1 kHz, mono is fine.
