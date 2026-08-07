import { describe, expect, it, vi } from "vite-plus/test";

import { installChunkLoadRecovery } from "./chunkLoadRecovery";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe("chunk load recovery", () => {
  it("reloads once when a built chunk no longer exists", () => {
    const target = new EventTarget();
    const storage = createStorage();
    const reload = vi.fn();
    installChunkLoadRecovery({
      target,
      getStorage: () => storage,
      buildId: "http://localhost/assets/index-current.js",
      reload,
    });

    const firstError = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(firstError);

    expect(firstError.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    const repeatedError = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(repeatedError);

    expect(repeatedError.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lets the error surface when this build already attempted recovery", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    installChunkLoadRecovery({
      target,
      getStorage: () => createStorage("http://localhost/assets/index-current.js"),
      buildId: "http://localhost/assets/index-current.js",
      reload,
    });

    const error = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(error);

    expect(error.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not risk a reload loop when session storage is unavailable", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    installChunkLoadRecovery({
      target,
      getStorage: () => {
        throw new Error("storage unavailable");
      },
      buildId: "http://localhost/assets/index-current.js",
      reload,
    });

    const error = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(error);

    expect(error.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
