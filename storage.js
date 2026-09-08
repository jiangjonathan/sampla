(() => {
  // Provider contract: list(), get(id), put(record), remove(id).
  class IndexedDbRecordingProvider {
    constructor({ database = "sampla-library", store = "recordings" } = {}) {
      this.database = database;
      this.store = store;
      this.connection = null;
    }

    open() {
      if (this.connection) return this.connection;
      this.connection = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.database, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.store)) {
            const recordings = db.createObjectStore(this.store, { keyPath: "id" });
            recordings.createIndex("createdAt", "createdAt");
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.connection = null;
          };
          db.onclose = () => {
            this.connection = null;
          };
          resolve(db);
        };
        request.onerror = () => reject(request.error || new Error("Storage unavailable"));
      }).catch((error) => {
        this.connection = null;
        throw error;
      });
      return this.connection;
    }

    async request(method, value) {
      const db = await this.open();
      const readOnly = method === "getAll" || method === "get";
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.store, readOnly ? "readonly" : "readwrite");
        const recordings = transaction.objectStore(this.store);
        const request = method === "getAll" ? recordings.getAll() : recordings[method](value);
        if (readOnly) request.onsuccess = () => resolve(request.result);
        else transaction.oncomplete = () => resolve(request.result);
        request.onerror = () => reject(request.error || transaction.error || new Error("Storage request failed"));
        transaction.onerror = () => reject(transaction.error || new Error("Storage transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("Storage transaction aborted"));
      });
    }

    list() {
      return this.request("getAll");
    }

    get(id) {
      return this.request("get", id);
    }

    put(record) {
      return this.request("put", record);
    }

    remove(id) {
      return this.request("delete", id);
    }
  }

  const recordingStorage = {
    provider: null,

    use(provider) {
      if (!provider || ["list", "get", "put", "remove"].some((method) => typeof provider[method] !== "function")) {
        throw new TypeError("Recording storage providers need list, get, put, and remove methods");
      }
      this.provider = provider;
      return this;
    },

    list() {
      return this.provider.list();
    },

    get(id) {
      return this.provider.get(id);
    },

    put(record) {
      return this.provider.put(record);
    },

    remove(id) {
      return this.provider.remove(id);
    },
  };

  window.SamplaStorage = recordingStorage.use(new IndexedDbRecordingProvider());
  window.SamplaStorage.IndexedDbProvider = IndexedDbRecordingProvider;
})();
