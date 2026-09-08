const JAM_CONFIG = globalThis.SamplaJamConfig || {};
const API_KEY = globalThis.SamplaFirebaseConfig?.apiKey || "";
const RECAPTCHA_PARAMS_URL =
  `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getRecaptchaParam?key=${API_KEY}`;
const SEND_CODE_URL =
  `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${API_KEY}`;
const CONFIRM_CODE_URL =
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${API_KEY}`;

const query = new URLSearchParams(window.location.search);
const requestId = query.get("requestId") || "";
const extensionId = query.get("extensionId") || "";
const statusElement = document.getElementById("status");
const phoneForm = document.getElementById("phone-form");
const phoneInput = document.getElementById("phone-input");
const sendButton = document.getElementById("send-button");
const codeForm = document.getElementById("code-form");
const codeInput = document.getElementById("code-input");
const verifyButton = document.getElementById("verify-button");
const phoneSummary = document.getElementById("phone-summary");
const changeButton = document.getElementById("change-button");
const resendButton = document.getElementById("resend-button");

let widgetId = null;
let recaptchaLoaded = false;
let recaptchaParams = null;
let phoneNumber = "";
let sessionInfo = "";
let pendingAction = null;
let sending = false;
let verifying = false;
let lastSubmittedCode = "";

function setStatus(message, state = "") {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", state === "error");
  statusElement.classList.toggle("success", state === "success");
}

function normalizePhoneNumber(value) {
  const raw = (value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && digits.length >= 7 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 7 && digits.length <= 15) return `+${digits}`;
  throw new Error("Enter a valid phone number, including the country code.");
}

function firebaseError(message) {
  if (message.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) return "Too many attempts. Wait a few minutes and try again.";
  if (message.includes("INVALID_PHONE_NUMBER")) return "That phone number is not valid.";
  if (message.includes("QUOTA_EXCEEDED")) return "Jam cannot send more codes right now. Try again later.";
  if (message.includes("CAPTCHA_CHECK_FAILED") || message.includes("MISSING_CLIENT_IDENTIFIER")) {
    return "The security check was not accepted. Please try again.";
  }
  if (message.includes("INVALID_CODE")) return "That code is incorrect. Please try again.";
  if (message.includes("SESSION_EXPIRED")) return "That code expired. Send a new one.";
  return "Jam sign-in failed. Please try again.";
}

function runSecurityCheck(action) {
  if (widgetId === null) {
    setStatus("The security check is still loading. Try again in a moment.", "error");
    return;
  }
  pendingAction = action;
  setStatus("Checking this request…");
  try {
    grecaptcha.reset(widgetId);
    grecaptcha.execute(widgetId);
  } catch {
    pendingAction = null;
    setStatus("The security check could not be started. Please try again.", "error");
  }
}

async function sendCode(recaptchaToken) {
  sending = true;
  sendButton.disabled = true;
  resendButton.disabled = true;
  setStatus("Sending your Jam code…");
  try {
    const response = await fetch(SEND_CODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, recaptchaToken, returnSecureToken: true }),
    });
    const data = await response.json();
    if (!response.ok || data.error || !data.sessionInfo) {
      throw new Error(data.error?.message || "INVALID_VERIFICATION_RESPONSE");
    }
    sessionInfo = data.sessionInfo;
    phoneSummary.textContent = `Code sent to ${phoneNumber}`;
    phoneForm.hidden = true;
    codeForm.hidden = false;
    codeInput.value = "";
    lastSubmittedCode = "";
    setStatus("Enter the code from your text message.");
    codeInput.focus();
  } catch (error) {
    setStatus(firebaseError(error.message || ""), "error");
  } finally {
    sending = false;
    sendButton.disabled = widgetId === null;
    resendButton.disabled = false;
  }
}

function sendToExtension(firebaseToken) {
  return new Promise((resolve, reject) => {
    if (!window.chrome?.runtime?.sendMessage) {
      reject(new Error("The Sampla extension could not be reached. Start again from Sampla."));
      return;
    }
    window.chrome.runtime.sendMessage(
      extensionId,
      { type: "SAMPLA_JAM_AUTH_COMPLETE", requestId, firebaseToken },
      (response) => {
        if (window.chrome.runtime.lastError) {
          reject(new Error(window.chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Sampla could not complete the connection."));
          return;
        }
        resolve(response);
      }
    );
  });
}

async function verifyCode() {
  if (verifying || !sessionInfo) return;
  const code = codeInput.value.replace(/\D/g, "").slice(0, 6);
  codeInput.value = code;
  if (code.length !== 6) {
    setStatus("Enter the 6-digit code from your text message.", "error");
    return;
  }

  verifying = true;
  verifyButton.disabled = true;
  setStatus("Connecting to Jam…");
  try {
    const response = await fetch(CONFIRM_CODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionInfo, code }),
    });
    const data = await response.json();
    if (!response.ok || data.error || !data.idToken) {
      throw new Error(data.error?.message || "INVALID_VERIFICATION_RESPONSE");
    }
    await sendToExtension(data.idToken);
    phoneForm.hidden = true;
    codeForm.hidden = true;
    setStatus("Connected. Returning to Sampla…", "success");
  } catch (error) {
    lastSubmittedCode = "";
    setStatus(firebaseError(error.message || "") === "Jam sign-in failed. Please try again."
      ? error.message || "Jam sign-in failed. Please try again."
      : firebaseError(error.message || ""), "error");
    codeInput.focus();
    codeInput.select();
  } finally {
    verifying = false;
    verifyButton.disabled = false;
  }
}

function initializeWidget() {
  if (!recaptchaLoaded || !recaptchaParams || widgetId !== null) return;
  try {
    widgetId = grecaptcha.render("recaptcha-container", {
      sitekey: recaptchaParams.recaptchaSiteKey,
      stoken: recaptchaParams.recaptchaStoken,
      size: "invisible",
      callback: (token) => {
        const action = pendingAction;
        pendingAction = null;
        if (action === "send") sendCode(token);
      },
      "error-callback": () => setStatus("The security check could not be completed.", "error"),
      "expired-callback": () => setStatus("The security check expired. Please try again.", "error"),
    });
    phoneForm.hidden = false;
    sendButton.disabled = false;
    setStatus("Sign in with the phone number on your Jam account.");
    phoneInput.focus();
  } catch {
    setStatus("The security check could not be initialized.", "error");
  }
}

async function loadRecaptchaParams() {
  try {
    const response = await fetch(RECAPTCHA_PARAMS_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const params = await response.json();
    if (!params.recaptchaSiteKey || !params.recaptchaStoken) throw new Error("Incomplete settings");
    recaptchaParams = params;
    initializeWidget();
  } catch {
    setStatus("Jam sign-in is unavailable. Check your connection and try again.", "error");
  }
}

phoneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (sending) return;
  try {
    phoneNumber = normalizePhoneNumber(phoneInput.value);
    phoneInput.value = phoneNumber;
    runSecurityCheck("send");
  } catch (error) {
    setStatus(error.message, "error");
    phoneInput.focus();
  }
});

codeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  verifyCode();
});

codeInput.addEventListener("input", () => {
  const code = codeInput.value.replace(/\D/g, "").slice(0, 6);
  codeInput.value = code;
  if (code.length === 6 && code !== lastSubmittedCode) {
    lastSubmittedCode = code;
    verifyCode();
  }
});

changeButton.addEventListener("click", () => {
  sessionInfo = "";
  codeForm.hidden = true;
  phoneForm.hidden = false;
  setStatus("Sign in with the phone number on your Jam account.");
  phoneInput.focus();
});

resendButton.addEventListener("click", () => {
  if (!sending) runSecurityCheck("send");
});

window.onRecaptchaLoaded = function() {
  recaptchaLoaded = true;
  initializeWidget();
};

if (!API_KEY) {
  setStatus("Jam phone sign-in has not been configured yet.", "error");
} else if (!requestId || !/^[a-p]{32}$/.test(extensionId)) {
  setStatus("Start account linking from the Sampla extension.", "error");
} else {
  loadRecaptchaParams();
}
