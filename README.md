# Sampla

Sampla is a Manifest V3 Chrome extension for quickly recording, trimming, looping, and exporting browser-tab audio in a tape-deck interface.

## Development

Requirements: a current version of Chrome and Node.js 20 or newer.

```bash
npm run check
```

To run the extension, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this repository. Click Sampla's toolbar icon on an ordinary HTTP or HTTPS page.

Sampla requests access to the active tab only after a toolbar click. Tab capture and offscreen-document permissions support audio recording and playback; storage keeps recordings and preferences locally. See [SECURITY.md](SECURITY.md) for reporting and security notes.

## Jam / Canvas integration

The optional Jam account-linking and Canvas upload implementation is isolated in [`integrations/jam-canvas/`](integrations/jam-canvas/). Sampla's local recording and WAV export continue to work without it.

The checked-in client configuration targets Jam's existing Firebase project and API. Deploying the hosted sign-in page requires explicit access from that project's owner:

```bash
npm run jam:check
npm run jam:deploy
```

Setup, trust boundaries, and deployment details are documented in the [integration README](integrations/jam-canvas/README.md).

## Repository layout

- Root JavaScript, HTML, and CSS: extension runtime and UI
- `integrations/jam-canvas/`: optional account linking, API upload, and hosted auth page
- `tests/`: Node test suite
- `assets/` and `fonts/`: bundled static assets and their licenses

## Packaging

Before packaging a release, run the repository checks:

```bash
npm run check
```

Do not include `.env` files, service-account credentials, Firebase local state, or locally built archives. These are excluded by `.gitignore`.
