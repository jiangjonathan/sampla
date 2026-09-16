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

## Stem splitter

With an active sample of 30 seconds or less, click the split-arrow beside the
Edit button. Separation starts immediately inside Sampla and produces **Vocals**,
**Drums**, **Bass**, and **Other**. The original waveform animates into four stem
waveforms on the existing canvas when processing finishes. The same playhead, crop,
zoom, scrub, and deck transport remain active. Click a lane label to toggle that stem in the
synchronized mix. Pressing the split-arrow again toggles between the original and
four-lane waveform without rerunning separation. There are no independent players
or separate stem screen.

Separation runs locally in a dedicated worker using HTDemucs. First use downloads
and verifies a pinned 166 MB model from Hugging Face; it is cached when space is
available. Audio is never uploaded. Keep Sampla open while processing. Only samples
of 30 seconds or less are eligible, bounding processing time and memory use.
Cancellation terminates the worker and releases its memory.

The splitter uses 44.1 kHz stereo and exports 16-bit PCM WAVs. When necessary,
all stems receive the same attenuation to avoid clipping. Separation quality
depends on the recording; leakage and artifacts are possible.

The bundled ONNX Runtime Web 1.30.0 files are in `assets/vendor/onnxruntime/`;
no remote JavaScript is executed. The manifest permits WebAssembly compilation.
Graph optimization, CPU memory arenas, memory patterns, and weight prepacking
are disabled because the default model-loading path failed with `std::bad_alloc`.
Processing uses fixed 7.8-second segments with overlap and one inference at a time.
Each segment gets a second, aligned time-shift pass; averaging the two predictions
reduces shift-sensitive artifacts. Bass and Other remain independent model outputs
instead of being merged into a lower-detail Instruments stem.
The outputs receive a mixture-consistency projection, so the floating-point stems
sum to the source before export. Recombined WAVs can differ by 16-bit rounding and,
when a stem would clip, a shared gain reduction.

An optional real-model memory regression check (outside the normal unit tests):

```bash
npm run stems:smoke -- /path/to/htdemucs_fp16weights.onnx
```

Model: [StemSplitio HTDemucs ONNX](https://huggingface.co/StemSplitio/htdemucs-onnx),
revision `d54ed9eb60e258ea82131c6ee14578628816456a`.
See `assets/vendor/onnxruntime/LICENSE` and `assets/vendor/demucs-LICENSE` for notices.

## Development checks

Run the complete test and configuration check before loading or packaging a change:

```bash
npm run check
```

Sampla requests access to the active tab only after a toolbar click. Tab capture and offscreen-document permissions support audio recording and playback; storage keeps recordings and preferences locally. See [SECURITY.md](SECURITY.md) for reporting and security notes.

## Jam / Canvas integration

The optional Jam account-linking and Canvas upload implementation is isolated in [`integrations/jam-canvas/`](integrations/jam-canvas/). Sampla's local recording and WAV export continue to work without it.

The checked-in client configuration targets Jam's existing Firebase project and API. Deploying the hosted sign-in page requires explicit access from that project's owner:

```bash
npm run jam:check
SAMPLA_FIREBASE_API_KEY='your-authorized-key' npm run jam:deploy
```

Setup, trust boundaries, and deployment details are documented in the [integration README](integrations/jam-canvas/README.md).

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
├── integrations/
│   └── jam-canvas/        Optional Jam authentication and upload
└── tests/                 Node test suite
```

## Packaging

Before packaging a release, run the repository checks:

```bash
npm run check
```

Do not include `.env` files, service-account credentials, Firebase local state, or locally built archives. These are excluded by `.gitignore`.
