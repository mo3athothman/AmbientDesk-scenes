# Ambient Desk scenes

Animated wallpapers for the Ambient Desk app, installable with one
click from the app's **Browse** page. Anyone can add one: see [CONTRIBUTING.md](CONTRIBUTING.md).

- `catalog.json`: the list of packs (format below). The app reads it from
  `https://raw.githubusercontent.com/mo3athothman/AmbientDesk-scenes/main/catalog.json`.
- `packs/<id>/`: one folder per pack: the scene file and its preview.
- `tools/validate.mjs`: checks the catalogue and packs; `--write` fills in hashes, sizes and URLs.

When you install a pack, the app downloads its file and keeps it only if its size and SHA-256 match the catalogue,
its type is allowed, and an SVG contains no scripts or web links. Scenes run in locked-down frames: no scripts for
SVGs, and no network or access to the app for HTML pages.

## catalog.json

```jsonc
{
  "format": 1,                      // this layout; the app ignores catalogues with another number
  "name": "Ambient Desk scenes",
  "homepage": "https://github.com/mo3athothman/AmbientDesk-scenes", // "Add your own scene" in the app
  "updated": "2026-11-23",           // written by validate.mjs --write
  "packs": [
    {
      "id": "lantern-drift",         // lowercase-kebab-case, unique, never reused
      "title": "Lantern Drift",
      "author": "Ambient Desk",
      "licence": "CC0-1.0",          // CC0-1.0 | CC-BY-4.0 | CC-BY-SA-4.0 | MIT | Apache-2.0
      "description": "…",           // optional, 200 characters at most
      "type": "svg",                 // svg | image | video | html
      "file": "https://raw.githubusercontent.com/mo3athothman/AmbientDesk-scenes/main/packs/lantern-drift/scene.svg",
      "preview": "https://raw.githubusercontent.com/mo3athothman/AmbientDesk-scenes/main/packs/lantern-drift/preview.svg",
      "sha256": "d35e…",             // lowercase hex SHA-256 of the file
      "size": 5257,                  // the file's exact size in bytes
      "tags": ["dark", "night", "calm"]
    }
  ]
}
```

`file` and `preview` may be written as `packs/<id>/…` while you work: `node tools/validate.mjs --write` turns them
into the published URLs above. (The app also accepts URLs relative to the catalogue, for catalogues hosted
elsewhere.)

Limits: catalogue 1 MB and 500 packs; files 5 MB for `svg` and `html`, 20 MB for `image`, 100 MB for `video` (the
app enforces these too); previews 1 MB (checked by `tools/validate.mjs`).

## Trying packs in the app before they're published

```sh
node tools/validate.mjs --local      # writes catalog.local.json with local paths
python -m http.server 8765
```

Then in Ambient Desk: **Settings → Scene store → `http://localhost:8765/catalog.local.json`**. (The app accepts
`http://` only for `localhost`.) Clear the field afterwards to go back to the published catalogue.

All files here are stored byte for byte (`.gitattributes`: `* -text`), so their SHA-256 stays the same on every
checkout.
