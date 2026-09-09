import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const contentSource = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");

function createHarness() {
  const runtimeListeners = [];
  const windowListeners = new Map();
  const appendedHosts = [];

  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.style = {};
      this.classList = { toggle() {} };
      this.dataset = {};
      this.children = [];
      this.listeners = new Map();
      this.isConnected = false;
      this.contentWindow = { postMessage() {} };
    }

    append(...children) {
      this.children.push(...children);
    }

    attachShadow() {
      const root = new FakeElement("shadow-root");
      root.fonts = { add() {} };
      this.shadowRoot = root;
      return root;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    setAttribute() {}
    closest() { return null; }
    setPointerCapture() {}
    hasPointerCapture() { return false; }
    releasePointerCapture() {}

    getBoundingClientRect() {
      const width = this.id === "sampla-floating-host" ? 392 : 0;
      const height = this.id === "sampla-floating-host" ? 523 : 0;
      const left = Number.parseFloat(this.style.left) || 784;
      const top = Number.parseFloat(this.style.top) || 24;
      return { left, top, width, height, right: left + width, bottom: top + height };
    }

    get offsetWidth() { return 392; }
    get offsetHeight() { return 523; }
  }

  const documentElement = new FakeElement("html");
  documentElement.append = (host) => {
    host.isConnected = true;
    appendedHosts.push(host);
  };

  const document = {
    documentElement,
    fonts: { add() {} },
    createElement: (tagName) => new FakeElement(tagName),
  };
  const window = {
    innerWidth: 1200,
    innerHeight: 700,
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  const chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener(listener) { runtimeListeners.push(listener); } },
    },
  };
  class FontFace {
    async load() { return this; }
  }

  vm.runInContext(contentSource, vm.createContext({ window, document, chrome, FontFace, console }));
  return { runtimeListeners, windowListeners, appendedHosts, window };
}

test("a detached overlay is restored and shown on the next toolbar click", () => {
  const { runtimeListeners, appendedHosts } = createHarness();
  const toggle = runtimeListeners[0];

  let response;
  toggle({ type: "SAMPLA_TOGGLE_WINDOW" }, {}, (value) => { response = value; });
  assert.equal(response.visible, true);
  assert.equal(appendedHosts.length, 1);

  const host = appendedHosts[0];
  host.isConnected = false;
  toggle({ type: "SAMPLA_TOGGLE_WINDOW" }, {}, (value) => { response = value; });

  assert.equal(appendedHosts.length, 2);
  assert.equal(host.isConnected, true);
  assert.equal(host.style.display, "block");
  assert.equal(response.visible, true);
});

test("a visible overlay is moved back into the viewport after resize", () => {
  const { runtimeListeners, windowListeners, appendedHosts, window } = createHarness();
  runtimeListeners[0]({ type: "SAMPLA_TOGGLE_WINDOW" }, {}, () => {});
  const container = appendedHosts[0].shadowRoot.children.find((child) => child.id === "sampla-floating-host");

  window.innerWidth = 500;
  window.innerHeight = 400;
  windowListeners.get("resize")();

  assert.equal(container.style.left, "100px");
  assert.equal(container.style.top, "8px");
  assert.equal(container.style.right, "auto");
});
