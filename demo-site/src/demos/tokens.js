const FIELDS = [
  { key: "--line", label: "--line", value: "#ff0000" },
  { key: "--bg", label: "--bg", value: "#000000" },
  { key: "--dim", label: "--dim", value: "#7a1010" },
  { key: "--edit", label: "--edit", value: "#ffd400" },
  { key: "--tape", label: "--tape", value: "#ffffff" },
];

export function mountTokens(root) {
  root.innerHTML = `
    <div class="tokens-panel">
      <h3>Live embed tokens</h3>
      <div class="token-grid">
        ${FIELDS.map(
          (field) => `
            <label class="token-field">
              <span>${field.label}</span>
              <input type="color" data-token="${field.key}" value="${field.value}" />
            </label>
          `,
        ).join("")}
      </div>
      <div class="token-swatches" data-swatches></div>
    </div>
  `;

  const swatches = root.querySelector("[data-swatches]");

  function apply() {
    const embeds = document.querySelectorAll(".deck-embed");
    const used = [];
    for (const input of root.querySelectorAll("[data-token]")) {
      const key = input.dataset.token;
      const value = input.value;
      used.push([key, value]);
      embeds.forEach((el) => el.style.setProperty(key, value));
    }
    swatches.innerHTML = used
      .map(([key, value]) => `<span class="token-swatch"><i style="background:${value}"></i>${key} ${value}</span>`)
      .join("");
    document.dispatchEvent(new Event("sampla-tokens"));
  }

  root.addEventListener("input", apply);
  apply();
}
