# Icon assets

Drop icon files here and they appear in game — no import statement, no code change.

## Naming

The file name is the icon key from `src/icons/keys.ts` with dots replaced by dashes:

| Icon key            | File name                |
| ------------------- | ------------------------ |
| `poi.supermarket`   | `poi-supermarket.png`    |
| `action.sleep`      | `action-sleep.png`       |
| `stance.guarded`    | `stance-guarded.png`     |

`.png`, `.webp` and `.svg` all work. Any key with no file here keeps rendering
its emoji fallback, so the set can be migrated a few icons at a time.

## What the art should look like

Icons are drawn through a CSS mask: only the **alpha channel** is used, and the
shape is filled with the surrounding text colour. That means one asset renders
white on a dark panel, black on a filled button, and red when the UI is warning
you — automatically.

- **Monochrome silhouette on a transparent background.** The colour you author
  is discarded, so a black glyph on transparency is ideal.
- **Export at 3–4× display size** (64–96 px). Icons render at ~16–24 px and
  masks go soft if the source is undersized.
- **No internal shading or multiple tones** — everything inside the silhouette
  becomes one flat colour.

For an icon that must keep its own colours, add its key to `UNTINTED` in
`src/icons/registry.ts`; it will render as a plain `<img>` instead.

## Checking what's left

In the browser console:

```js
import('/src/icons/registry.ts').then((m) => console.table(m.missingIcons()));
```
