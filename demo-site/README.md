# Sampla demo site

Static case-study site for [Sampla](https://github.com/jiangjonathan/sampla), a Manifest V3 Chrome extension that records, trims, loops, and exports browser-tab audio in a tape-deck interface.

This folder is self-contained. It does not call `tabCapture`, offscreen documents, or Jam APIs. Interactive demos play a short original loop synthesized in the page.

Page chrome is a clean technical write-up. The black/red IBM Plex Mono tape UI is scoped to the embeds.

## Install

Requires Node.js 20 or newer.

```bash
cd demo-site
npm install
```

## Develop

```bash
npm run dev
```

Vite serves the site at `http://localhost:5173`. Tokens on `.deck-embed` can be tuned in `src/styles.css` (`:root`) or live in the Tokens section.

## Build

```bash
npm run build
```

Output lands in `demo-site/dist/` (not the extension root). Preview the production build:

```bash
npm run preview
```

## Static deploy

`dist/` is a static site (`base: './'` in `vite.config.js`), so it can sit at a domain root or in a subpath.

**Cloudflare Pages**

1. Set the project root to `demo-site` (or the whole repo with root directory `demo-site`).
2. Build command: `npm run build`
3. Output directory: `dist`

**GitHub Pages / any static host**

Upload `dist/`, or point the host at that folder after CI runs `npm run build` inside `demo-site`.

Do not copy `dist/` into the extension package. Load unpacked still uses the repository root (`manifest.json`).

## Layout

```text
demo-site/
├── index.html           Case-study copy and section shells
├── public/favicon.svg
├── src/
│   ├── main.js          Boot demos
│   ├── styles.css       Page + product tokens
│   ├── toc.js
│   ├── audio/           Synthetic sample, player, WAV encode
│   ├── demos/           Tape deck, waveform, token panel
│   └── assets/fonts/    IBM Plex Mono (SIL OFL)
├── package.json
└── vite.config.js
```

## Tokens

Documented in `src/styles.css` and on the page. Product defaults match the extension:

| Token | Default | Use |
| --- | --- | --- |
| `--bg` | `#000000` | Deck ground |
| `--line` | `#ff0000` | Stroke, keys, waveform |
| `--dim` | `#7a1010` | Idle / disabled |
| `--edit` | `#ffd400` | Crop / splice accent |
| `--tape` | `#ffffff` | Tape pack |
| `--ui-font` | IBM Plex Mono | Product UI |
