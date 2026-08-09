import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("preferred editor persistence", () => {
  it("migrates the legacy raw editor preference when opening a file", async () => {
    const localStorage = createLocalStorageStub();
    localStorage.setItem("t3code:last-editor", "vscode");
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);
    const { resolveAndPersistPreferredEditor } = await import("./editorPreferences");

    expect(resolveAndPersistPreferredEditor(["cursor", "vscode"])).toBe("vscode");
    expect(localStorage.getItem("t3code:last-editor")).toBe('"vscode"');
  });
});
