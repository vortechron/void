const RECOVERED_BUILD_STORAGE_KEY = "t3:chunk-load-recovery-build";

interface ChunkLoadRecoveryOptions {
  readonly target: Pick<EventTarget, "addEventListener">;
  readonly getStorage: () => Pick<Storage, "getItem" | "setItem">;
  readonly buildId: string;
  readonly reload: () => void;
}

/** Reloads a stale client once when a deployment removes one of its lazy chunks. */
export function installChunkLoadRecovery(options: ChunkLoadRecoveryOptions): void {
  options.target.addEventListener("vite:preloadError", (event) => {
    try {
      const storage = options.getStorage();
      if (storage.getItem(RECOVERED_BUILD_STORAGE_KEY) === options.buildId) {
        return;
      }
      storage.setItem(RECOVERED_BUILD_STORAGE_KEY, options.buildId);
    } catch {
      return;
    }

    event.preventDefault();
    options.reload();
  });
}
