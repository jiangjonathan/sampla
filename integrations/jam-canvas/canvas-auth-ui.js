(function installCanvasAuthUI(root) {
  class CanvasAuthUI {
    constructor({
      canvasStatusIndicator,
      canvasAuthBtn,
      canvasAuthDialog,
      canvasAuthMessage,
      canvasAuthError,
      onStatus,
    }) {
      this.statusIndicator = canvasStatusIndicator;
      this.authBtn = canvasAuthBtn;
      this.authDialog = canvasAuthDialog;
      this.authMessage = canvasAuthMessage;
      this.authError = canvasAuthError;
      this.onStatus = onStatus || (() => {});
      this.isOpening = false;

      this.init();
    }

    init() {
      this.authBtn?.addEventListener("click", () => {
        const session = window.SamplaCanvasAuth?.getSession();
        if (session?.token) {
          window.SamplaCanvasAuth.clearSession();
          this.syncUI();
          this.onStatus("signed out of jam");
          return;
        }
        this.connect();
      });

      window.addEventListener("sampla-canvas-auth-changed", () => this.syncUI());
      this.syncUI();
    }

    syncUI() {
      if (!this.statusIndicator || !this.authBtn) return;
      const session = window.SamplaCanvasAuth?.getSession();
      const label = this.authBtn.querySelector("span");
      if (session?.token) {
        const rawUsername = (session.username || "").trim();
        const isGeneric = !rawUsername || rawUsername.toLowerCase() === "jam user" || rawUsername.toLowerCase() === "connected";
        this.statusIndicator.textContent = isGeneric ? "Connected" : `@${rawUsername}`;
        this.statusIndicator.classList.add("connected");
        if (label) label.textContent = "Disconnect";
        if (this.authDialog) this.authDialog.hidden = true;
      } else {
        this.statusIndicator.textContent = "Disconnected";
        this.statusIndicator.classList.remove("connected");
        if (label) label.textContent = this.isOpening ? "Opening…" : "Connect";
      }
    }

    async connect() {
      if (this.isOpening) return;
      this.hideError();
      this.isOpening = true;
      this.authBtn.disabled = true;
      if (this.authDialog) this.authDialog.hidden = false;
      if (this.authMessage) this.authMessage.textContent = "Finish signing in in the Jam tab that just opened.";
      this.syncUI();

      try {
        await window.SamplaCanvasAuth.startJamLink();
        this.onStatus("finish connecting in the jam tab");
      } catch (error) {
        this.showError(error.message || "Jam sign-in could not be opened.");
      } finally {
        this.isOpening = false;
        this.authBtn.disabled = false;
        this.syncUI();
      }
    }

    openDialog() {
      if (window.SamplaCanvasAuth?.getSession()?.token) return;
      if (this.authDialog) this.authDialog.hidden = false;
      if (this.authMessage) this.authMessage.textContent = "Connect your Jam account to send recordings to your library.";
      this.hideError();
    }

    showError(message) {
      if (!this.authError) return;
      this.authError.textContent = message;
      this.authError.hidden = false;
    }

    hideError() {
      if (this.authError) this.authError.hidden = true;
    }
  }

  root.SamplaCanvasAuthUI = CanvasAuthUI;
})(typeof globalThis !== "undefined" ? globalThis : this);
