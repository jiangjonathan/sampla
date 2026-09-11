import "./styles.css";
import { createSample } from "./audio/sample.js";
import { TapePlayer } from "./audio/player.js";
import { mountTapeDeck } from "./demos/tape-deck.js";
import { mountWaveform } from "./demos/waveform.js";
import { mountTokens } from "./demos/tokens.js";
import { initToc } from "./toc.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

async function boot() {
  const sample = await createSample();
  const deckPlayer = new TapePlayer();
  const wavePlayer = new TapePlayer();
  await deckPlayer.init();
  await wavePlayer.init();
  deckPlayer.setBuffer(sample.buffer);
  wavePlayer.setBuffer(sample.buffer);

  mountTapeDeck(document.getElementById("demo-deck"), {
    player: deckPlayer,
    reducedMotion,
  });

  mountWaveform(document.getElementById("demo-wave"), {
    player: wavePlayer,
    peaks: sample.peaks,
    reducedMotion,
  });

  mountTokens(document.getElementById("demo-tokens"));
  initToc();
}

boot().catch((error) => {
  const deck = document.getElementById("demo-deck");
  if (deck) {
    deck.innerHTML = `<p class="interactive-note">Could not start the audio demos: ${error.message}</p>`;
  }
});
