# ElevenLabs narration guide

Use a calm, precise British female voice at a measured pace. As a starting point, set stability to about 60%, similarity to about 75%, style exaggeration to 0–10%, and enable speaker boost if the selected voice supports it. Keep the same voice and settings for all ten files.

Export the narration with these exact filenames:

- `voice_01_lexus.mp3`
- `voice_02_nissan.mp3`
- `voice_03_audi.mp3`
- `voice_04_bmw.mp3`
- `voice_05_mercedes.mp3`
- `voice_06_ferrari.mp3`
- `voice_07_mclaren.mp3`
- `voice_08_aston.mp3`
- `voice_09_lamborghini.mp3`
- `voice_10_porsche.mp3`

Place the source files in `audios/voices/`, then copy the same ten files to `public/audios/voices/` for the site build.

Until they are added, the site degrades gracefully and shows a “narration unavailable” state.
