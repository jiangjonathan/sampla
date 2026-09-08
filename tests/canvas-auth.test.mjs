import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const canvasAuthSource = readFileSync(new URL("../integrations/jam-canvas/canvas-auth.js", import.meta.url), "utf8");
const hostedAuthSource = readFileSync(
  new URL("../integrations/jam-canvas/hosted/sampla-auth/auth.js", import.meta.url),
  "utf8"
);
const jamConfigSource = readFileSync(
  new URL("../integrations/jam-canvas/hosted/sampla-auth/config.js", import.meta.url),
  "utf8"
);
const backgroundSource = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const canvasApiSource = readFileSync(new URL("../integrations/jam-canvas/canvas-api.js", import.meta.url), "utf8");

function loadCanvasAuth() {
  const values = new Map();
  const storageListeners = [];
  const windowEvents = [];
  const runtimeMessages = [];
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback({ ok: true, requestId: "request-1", tabId: 8 });
      },
    },
    storage: {
      local: {
        get(_keys, callback) { callback({}); },
        set() {},
        remove() {},
      },
      onChanged: { addListener(listener) { storageListeners.push(listener); } },
    },
  };
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const window = {
    dispatchEvent(event) { windowEvents.push(event); },
    addEventListener() {},
  };

  const context = vm.createContext({
    window,
    localStorage,
    chrome,
    fetch: async () => {},
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    console,
    URL,
  });
  vm.runInContext(jamConfigSource, context);
  vm.runInContext(canvasAuthSource, context);
  return { auth: window.SamplaCanvasAuth, values, runtimeMessages, storageListeners, windowEvents };
}

test("account linking opens the Jam sign-in tab without collecting a phone number", async () => {
  const { auth, runtimeMessages } = loadCanvasAuth();
  const result = await auth.startJamLink();

  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages[0])), {
    type: "SAMPLA_START_JAM_LINK",
    authPageUrl: "https://bop-mobile.web.app/sampla-auth/",
  });
  assert.equal(result.tabId, 8);
});

test("Jam environment values are centralized in the shared configuration", () => {
  for (const source of [backgroundSource, canvasAuthSource, canvasApiSource, hostedAuthSource]) {
    assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{35}/);
    assert.doesNotMatch(source, /https:\/\/bop-mobile\.web\.app\/sampla-auth\//);
  }
  assert.doesNotMatch(jamConfigSource, /firebaseApiKey/);
  assert.match(jamConfigSource, /firebaseProjectId: "bop-mobile"/);
  assert.match(jamConfigSource, /apiBaseUrl: "https:\/\/api\.shibuyaaa\.com"/);
});

test("a session completed in the Jam tab is reflected in an open extension page", () => {
  const { auth, values, storageListeners, windowEvents } = loadCanvasAuth();
  const session = { token: "jam-token", username: "sampler" };

  storageListeners[0]({ "sampla-canvas-auth": { newValue: session } }, "local");

  assert.deepEqual(JSON.parse(JSON.stringify(auth.getSession())), session);
  assert.equal(JSON.parse(values.get("sampla-canvas-auth")).username, "sampler");
  assert.equal(windowEvents.at(-1).type, "sampla-canvas-auth-changed");
});

function createElement() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    listeners,
    classList: { toggle() {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
    focus() {},
    select() {},
  };
}

test("the Jam tab completes phone verification and returns only the Firebase token", async () => {
  const elementIds = [
    "status",
    "phone-form",
    "phone-input",
    "send-button",
    "code-form",
    "code-input",
    "verify-button",
    "phone-summary",
    "change-button",
    "resend-button",
    "recaptcha-container",
  ];
  const elements = new Map(elementIds.map((id) => [id, createElement()]));
  const extensionMessages = [];
  const requestBodies = [];
  let renderOptions;
  let executeCount = 0;
  const grecaptcha = {
    render(_container, options) { renderOptions = options; return 7; },
    reset() {},
    execute() { executeCount += 1; },
  };
  const fetch = async (url, options = {}) => {
    if (String(url).includes("getRecaptchaParam")) {
      return {
        ok: true,
        json: async () => ({ recaptchaSiteKey: "firebase-site-key", recaptchaStoken: "firebase-stoken" }),
      };
    }
    requestBodies.push(JSON.parse(options.body));
    if (String(url).includes("sendVerificationCode")) {
      return { ok: true, json: async () => ({ sessionInfo: "phone-session" }) };
    }
    return { ok: true, json: async () => ({ idToken: "firebase-id-token" }) };
  };
  const window = {
    location: {
      search: "?requestId=req-1&extensionId=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(extensionId, message, callback) {
          extensionMessages.push({ extensionId, message });
          callback({ ok: true, username: "sampler" });
        },
      },
    },
  };

  const context = vm.createContext({
    window,
    document: { getElementById: (id) => elements.get(id) },
    URLSearchParams,
    fetch,
    grecaptcha,
    console,
  });
  vm.runInContext(jamConfigSource, context);
  vm.runInContext('globalThis.SamplaFirebaseConfig = { apiKey: "test-firebase-api-key" };', context);
  vm.runInContext(hostedAuthSource, context);
  await new Promise((resolve) => setImmediate(resolve));
  window.onRecaptchaLoaded();

  assert.equal(renderOptions.sitekey, "firebase-site-key");
  assert.equal(renderOptions.stoken, "firebase-stoken");
  assert.equal(elements.get("phone-form").hidden, false);

  elements.get("phone-input").value = "(416) 555-0123";
  elements.get("phone-form").listeners.get("submit")({ preventDefault() {} });
  assert.equal(executeCount, 1);
  renderOptions.callback("verified-recaptcha-token");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(requestBodies[0], {
    phoneNumber: "+14165550123",
    recaptchaToken: "verified-recaptcha-token",
    returnSecureToken: true,
  });
  assert.equal(elements.get("code-form").hidden, false);

  elements.get("code-input").value = "123456";
  elements.get("code-form").listeners.get("submit")({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(requestBodies[1], { sessionInfo: "phone-session", code: "123456" });
  assert.deepEqual(JSON.parse(JSON.stringify(extensionMessages[0])), {
    extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    message: {
      type: "SAMPLA_JAM_AUTH_COMPLETE",
      requestId: "req-1",
      firebaseToken: "firebase-id-token",
    },
  });
  assert.equal(elements.get("status").textContent, "Connected. Returning to Sampla…");
});

test("the Jam sign-in page refuses direct visits that did not start in the extension", async () => {
  const elements = new Map([
    "status", "phone-form", "phone-input", "send-button", "code-form", "code-input",
    "verify-button", "phone-summary", "change-button", "resend-button", "recaptcha-container",
  ].map((id) => [id, createElement()]));
  let fetched = false;
  const window = { location: { search: "" }, chrome: {} };

  const context = vm.createContext({
    window,
    document: { getElementById: (id) => elements.get(id) },
    URLSearchParams,
    fetch: async () => { fetched = true; },
    console,
  });
  vm.runInContext(jamConfigSource, context);
  vm.runInContext('globalThis.SamplaFirebaseConfig = { apiKey: "test-firebase-api-key" };', context);
  vm.runInContext(hostedAuthSource, context);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(fetched, false);
  assert.match(elements.get("status").textContent, /Start account linking from the Sampla extension/);
});

test("the background accepts a single-use result from the exact Jam tab and stores the session", async () => {
  const internalListeners = [];
  const externalListeners = [];
  const sessionStorage = new Map();
  const localStorage = new Map();
  const openedTabs = [];
  const closedTabs = [];
  const fetchBodies = [];
  const chrome = {
    runtime: {
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { internalListeners.push(listener); } },
      onMessageExternal: { addListener(listener) { externalListeners.push(listener); } },
      getContexts: async () => [],
      getURL: (path) => `chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${path}`,
    },
    action: { onClicked: { addListener() {} } },
    offscreen: { createDocument: async () => {} },
    scripting: { executeScript: async () => {} },
    tabCapture: {},
    tabs: {
      async create(options) { openedTabs.push(options); return { id: 42, ...options }; },
      async remove(tabId) { closedTabs.push(tabId); },
      async sendMessage() {},
      async query() { return []; },
    },
    storage: {
      session: {
        async set(items) { for (const [key, value] of Object.entries(items)) sessionStorage.set(key, value); },
        async get(key) { return { [key]: sessionStorage.get(key) }; },
        async remove(key) { sessionStorage.delete(key); },
      },
      local: {
        async set(items) { for (const [key, value] of Object.entries(items)) localStorage.set(key, value); },
      },
    },
  };
  const fetch = async (_url, options) => {
    fetchBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({
        success: true,
        session: {
          success: true,
          token: "jam-session",
          username: "sampler",
          userId: "user-1",
          profile: { userId: "user-1" },
        },
      }),
    };
  };

  const context = vm.createContext({
    chrome,
    crypto: { randomUUID: () => "request-1" },
    fetch,
    URL,
    console,
    setTimeout: (callback) => { callback(); return 1; },
  });
  vm.runInContext(jamConfigSource, context);
  vm.runInContext(backgroundSource, context);

  let rejectedStartResponse;
  internalListeners[0](
    { type: "SAMPLA_START_JAM_LINK", authPageUrl: "http://localhost:8765/sampla-auth/" },
    {},
    (response) => { rejectedStartResponse = response; }
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rejectedStartResponse.ok, false);
  assert.match(rejectedStartResponse.error, /Untrusted/);

  let startResponse;
  internalListeners[0](
    { type: "SAMPLA_START_JAM_LINK", authPageUrl: "https://bop-mobile.web.app/sampla-auth/" },
    {},
    (response) => { startResponse = response; }
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(startResponse.ok, true);
  const openedUrl = new URL(openedTabs[0].url);
  assert.equal(openedUrl.searchParams.get("requestId"), "request-1");
  assert.equal(openedUrl.searchParams.get("extensionId"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

  let wrongTabResponse;
  externalListeners[0](
    {
      type: "SAMPLA_JAM_AUTH_COMPLETE",
      requestId: "request-1",
      firebaseToken: "f".repeat(120),
    },
    { url: openedTabs[0].url, tab: { id: 99 } },
    (response) => { wrongTabResponse = response; }
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(wrongTabResponse.ok, false);
  assert.equal(fetchBodies.length, 0);

  let finishResponse;
  externalListeners[0](
    {
      type: "SAMPLA_JAM_AUTH_COMPLETE",
      requestId: "request-1",
      firebaseToken: "f".repeat(120),
    },
    { url: openedTabs[0].url, tab: { id: 42 } },
    (response) => { finishResponse = response; }
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(finishResponse.ok, true);
  assert.deepEqual(fetchBodies[0], { firebaseToken: "f".repeat(120) });
  assert.equal(localStorage.get("sampla-canvas-auth").token, "jam-session");
  assert.equal(sessionStorage.has("sampla-jam-auth-pending"), false);
  assert.deepEqual(closedTabs, [42]);
});

test("sound registration matches the authenticated Canvas created-object contract", async () => {
  const requests = [];
  const window = {
    SamplaCanvasAuth: {
      getApiBase: () => "https://api.shibuyaaa.com",
      getSession: () => ({ token: "jam-session" }),
      async apiFetch(url, options) {
        requests.push({ url, options });
        return { objects: [] };
      },
    },
  };
  const context = vm.createContext({ window, console });
  vm.runInContext(jamConfigSource, context);
  vm.runInContext(canvasApiSource, context);

  await window.SamplaCanvasApi.registerSoundObject({
    kind: "sampla-sound-recording-1",
    title: "Pocket recording",
    audioKey: "https://cdn.example.test/pocket.wav",
  });

  assert.equal(requests[0].url, "https://api.shibuyaaa.com/canvas/me/created-objects");
  assert.equal(requests[0].options.headers.Authorization, "Bearer jam-session");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    kind: "sampla-sound-recording-1",
    title: "Pocket recording",
    subtitle: "Sampla recording",
    collection: "Sampla",
    assetKey: "object-loop-rhythm-box",
    audioKey: "https://cdn.example.test/pocket.wav",
    audioGain: 1,
    bpm: null,
    accentHex: "#FF8C37",
    category: "soundEffects",
    source: "import",
  });
});
