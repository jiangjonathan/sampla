# Sampla

Sampla is a Manifest V3 Chrome extension for quickly recording, trimming, looping, and exporting browser-tab audio in a tape-deck interface.

## Load the extension in Chrome

Requirements: a current version of Chrome and Node.js 20 or newer.

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Select **Load unpacked**.
5. Choose the repository root—the folder containing `manifest.json`.
6. Pin Sampla from Chrome's Extensions menu, then click its toolbar icon on an ordinary HTTP or HTTPS page.

After changing the code, return to `chrome://extensions` and click the reload button on the Sampla card. Reload any page where Sampla was already open before testing again.

## Development

Run the complete test suite before loading or packaging a change:

```bash
npm run check
```

Sampla requests access to the active tab only after a toolbar click. Tab capture and offscreen-document permissions support audio recording and playback; storage keeps recordings and preferences locally. See [SECURITY.md](SECURITY.md) for reporting and security notes.

## Repository layout

```text
sampla/
├── manifest.json          Chrome extension manifest
├── popup.html             Tape-deck interface shell
├── offscreen.html         Background audio document
├── src/
│   ├── background.js      Extension service worker
│   ├── content.js         Page injection and floating window
│   ├── offscreen.js       Offscreen audio playback
│   ├── storage.js         Recording persistence
│   ├── audio/             Audio processing, export, and transport
│   └── ui/                Deck, waveform, controls, and popup logic
├── styles/                Extension stylesheets
├── assets/                Artwork, fonts, and licenses
└── tests/                 Node test suite
```

## Packaging

Before packaging a release, run the repository checks:

```bash
npm run check
```

Do not include `.env` files, service-account credentials, or locally built archives. These are excluded by `.gitignore`.
