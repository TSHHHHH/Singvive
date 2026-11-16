# Sound effects

Files here are played by the cue engine (`src/audio/sfx.ts`). Which file plays for which
moment is listed in `manifest.json`; the full list of moments ("cues") is
`src/audio/cues.ts`.

- **Easiest:** `npm run dev`, open **Dev → Sound**, and drop a file on a cue's row.
  It is saved here as `<cue id>.<ext>` and the manifest is updated.
- **By hand:** copy a file named after its cue (e.g. `combat.hit.ogg`) into this folder.
  The dev server adopts it on the next page load or Rescan. Without the dev server, run
  `npm run audio:manifest`.
- Formats: ogg, mp3, wav, m4a, webm, flac, opus. Prefer `.ogg` or `.mp3` (small); keep
  one-shots short. Limit 4 MB per file.
- A cue with no file is silent. Only commit audio you have the right to redistribute;
  this repo is public.
