# Adding a scene to the Ambient Desk store

Ambient Desk's **Browse** page lists the scenes in this folder's `catalog.json`. Anyone can add one by pull request.
Once it is merged and published, everyone can install it with one click.

## What a pack is

A pack is one wallpaper: a single file plus a small preview picture, in its own folder.

```
packs/
  your-scene-id/
    scene.svg        the wallpaper (or .png/.jpg/.webp/.gif/.avif, .mp4/.webm, or .html)
    preview.svg      the picture on its card in Browse (.svg, .png, .jpg or .webp)
```

The best packs are **animated SVGs** that move with CSS animations (`@keyframes` on `transform` and `opacity`).
They are small, stay sharp on every screen, and use little CPU.

| Type    | File extensions                          | Largest file |
|---------|------------------------------------------|--------------|
| `svg`   | `.svg`                                   | 5 MB         |
| `html`  | `.html` (one self-contained page)        | 5 MB         |
| `image` | `.png` `.jpg` `.jpeg` `.webp` `.gif` `.avif` | 20 MB    |
| `video` | `.mp4` `.webm`                           | 100 MB       |
| preview | `.svg` `.png` `.jpg` `.jpeg` `.webp`     | 1 MB         |

Aim for much less than these limits: most good SVG scenes are under 100 KB. A preview around 640×400 is plenty.

## Rules

**Make it yourself, or have the right to share it.** Only submit work you made, or work whose licence lets you
redistribute it (then say so in the pull request and credit the original author). No art traced or copied from
games, films, logos or other people's wallpapers.

**Pick one of these licences** and put its identifier in `licence`:

- `CC0-1.0`: public domain, anyone may use it for anything (preferred).
- `CC-BY-4.0`: anyone may use it, with credit to `author`.
- `CC-BY-SA-4.0`: as CC-BY, and changed versions must use the same licence.
- `MIT` or `Apache-2.0`: mostly for HTML scenes that are really code.

**Self-contained.** A pack may not load anything from the web: no `http://` or `https://` links, web fonts, CSS
`@import`, or scripts from other sites. Ambient Desk blocks those anyway, so the scene would just look broken.

**No code in SVGs.** SVG packs may not contain `<script>`, event handler attributes such as `onload=`,
`javascript:` links, `<foreignObject>`, `<iframe>`, `<embed>` or `<object>`. The app refuses to install such a file.

**HTML packs** may use scripts, but they run in a locked-down frame: no access to the app, your files, other
scenes, pop-ups or navigation. Keep them to one file, and make sure they stay light on the CPU: they run all day.

**Be kind to the desktop.** No flashing or strobing, nothing text-heavy, nothing that needs sound. Something you
could look at for hours.

## Adding your pack

1. Fork this repository and create `packs/<id>/`. The id is lowercase-kebab-case, like `lantern-drift`, and is
   never reused or renamed once published.
2. Add your `scene` file and `preview` picture.
3. Add an entry to `packs` in `catalog.json`:

   ```json
   {
     "id": "lantern-drift",
     "title": "Lantern Drift",
     "author": "Your name or handle",
     "licence": "CC0-1.0",
     "description": "One sentence about what moves in it (200 characters at most).",
     "type": "svg",
     "file": "packs/lantern-drift/scene.svg",
     "preview": "packs/lantern-drift/preview.svg",
     "sha256": "",
     "size": 0,
     "tags": ["dark", "night", "calm"]
   }
   ```

   Tags: up to 8 lowercase words. Use `dark` or `light` for the overall look, plus a few about the subject or mood.

4. Fill in `sha256` and `size` (and turn the two paths into the published URLs), then check everything:

   ```sh
   node tools/validate.mjs --write
   node tools/validate.mjs
   ```

   (Plain Node 18 or later, no installs.) The app downloads `file`, and installs it only if its size and SHA-256
   match these values exactly, so run `--write` again whenever you change the file. To see your scene in the app
   before it is merged, see "Trying packs in the app" in [README.md](README.md).

5. Open a pull request. Say what the scene is, that you made it (or where it is from and under which licence),
   and attach a short screen recording or GIF of it moving if you can.

## Updating or removing a pack

Change the file, run `node tools/validate.mjs --write`, and open a pull request. People who installed the old
version keep it; they can remove it and install again from Browse to get the new one.

To withdraw your pack, open a pull request that deletes its folder and its catalogue entry.

## For maintainers

- Review the SVG or HTML source itself, not just the preview: look for anything that phones home, flashes, or
  hides content that doesn't appear in the preview.
- `node tools/validate.mjs` must pass before merging. Keep its limits in step with `SceneStore.cs` in the app.
- Files are stored byte for byte (`.gitattributes`: `* -text`): never let an editor or Git change their line
  endings, or their SHA-256 stops matching.
- The app reads `catalog.json` and the packs from `main` through raw.githubusercontent.com, so anything merged to
  `main` is live for everyone within minutes (raw files are cached for about five minutes).
- This repository is published from the `store/` folder of the Ambient Desk app's repository; the validator's
  limits mirror the app's.
