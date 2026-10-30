import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { showContextMenuFallback } from "./contextMenuFallback";

type FakeListener = (event: FakeDomEvent) => void;

class FakeDomEvent {
  defaultPrevented = false;

  constructor(
    readonly type: string,
    init: Record<string, unknown> = {},
  ) {
    Object.assign(this, init);
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}
}

class FakeElement {
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  style: Record<string, string> & { cssText?: string } = {};
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  className = "";
  disabled = false;
  focused = false;
  type = "";
  private textValue = "";
  private readonly listeners = new Map<string, FakeListener[]>();

  constructor(readonly tagName: string) {}

  get isConnected() {
    let current: FakeElement | null = this;
    while (current?.parent) {
      current = current.parent;
    }
    return current?.tagName === "body";
  }

  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parent) {
      return;
    }
    const index = this.parent.children.indexOf(this);
    if (index >= 0) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }

  addEventListener(type: string, listener: FakeListener) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  dispatchEvent(event: FakeDomEvent) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
    return true;
  }

  focus() {
    const fakeDocument = document as unknown as FakeDocument;
    if (fakeDocument.activeElement === this) {
      return;
    }
    fakeDocument.activeElement?.blur();
    fakeDocument.activeElement = this;
    this.focused = true;
    this.dispatchEvent(new FakeDomEvent("focus"));
  }

  blur() {
    const fakeDocument = document as unknown as FakeDocument;
    if (fakeDocument.activeElement === this) {
      fakeDocument.activeElement = null;
    }
    this.focused = false;
    this.dispatchEvent(new FakeDomEvent("blur"));
  }

  set textContent(value: string) {
    this.textValue = value;
  }

  get textContent() {
    return `${this.textValue}${this.children.map((child) => child.textContent).join("")}`;
  }

  querySelectorAll(tagName: string): FakeElement[] {
    const matches: FakeElement[] = [];
    if (this.tagName === tagName) {
      matches.push(this);
    }
    for (const child of this.children) {
      matches.push(...child.querySelectorAll(tagName));
    }
    return matches;
  }

  getBoundingClientRect() {
    const left = Number.parseInt(this.style.left ?? "0", 10) || 0;
    const top = Number.parseInt(this.style.top ?? "0", 10) || 0;
    const width = this.tagName === "div" ? 180 : 140;
    const height = this.tagName === "div" ? 120 : 28;
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  }
}

class FakeBody extends FakeElement {
  private html = "";

  constructor() {
    super("body");
  }

  set innerHTML(value: string) {
    this.html = value;
    this.children = [];
  }

  get innerHTML() {
    return this.html;
  }
}

class FakeDocument {
  body = new FakeBody();
  activeElement: FakeElement | null = null;
  private readonly listeners = new Map<string, FakeListener[]>();

  createElement(tagName: string) {
    return new FakeElement(tagName);
  }

  addEventListener(type: string, listener: FakeListener) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: FakeListener) {
    const existing = this.listeners.get(type);
    if (!existing) {
      return;
    }
    const index = existing.indexOf(listener);
    if (index >= 0) {
      existing.splice(index, 1);
    }
  }

  dispatchEvent(event: FakeDomEvent) {
    // Snapshot: cleanup() detaches document listeners while they are running.
    for (const listener of (this.listeners.get(event.type) ?? []).slice()) {
      listener(event);
    }
    return true;
  }

  querySelectorAll(tagName: string) {
    return this.body.querySelectorAll(tagName);
  }
}

function findButton(label: string): FakeElement | undefined {
  return (document as unknown as FakeDocument)
    .querySelectorAll("button")
    .find((button) => button.textContent.includes(label));
}

/** The document-level press that precedes every genuine pointer click. */
function pointerDownInside(target: FakeElement, pointerType = "touch") {
  (document as unknown as FakeDocument).dispatchEvent(
    new PointerEvent("pointerdown", { target, pointerType } as unknown as PointerEventInit),
  );
}

/** A click as a browser reports it from a pointer: `detail` is 1, not 0. */
function pointerClick(target: FakeElement | undefined) {
  target?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal("document", new FakeDocument());
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("window", {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal(
    "MouseEvent",
    class extends FakeDomEvent {
      constructor(type: string, init: Record<string, unknown> = {}) {
        super(type, init);
      }
    },
  );
  vi.stubGlobal(
    "KeyboardEvent",
    class extends FakeDomEvent {
      constructor(type: string, init: Record<string, unknown> = {}) {
        super(type, init);
      }
    },
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends FakeDomEvent {
      constructor(type: string, init: Record<string, unknown> = {}) {
        super(type, init);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("showContextMenuFallback", () => {
  it("ignores a click from the gesture that opened the menu", async () => {
    let enablePointerSelection: ((time: number) => void) | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      enablePointerSelection = callback;
      return 0;
    });

    const selectionPromise = showContextMenuFallback([{ id: "rename", label: "Rename" }]);
    const renameButton = findButton("Rename");

    renameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    enablePointerSelection?.(0);
    renameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await expect(selectionPromise).resolves.toBe("rename");
  });

  it("drops the compatibility click iOS synthesises after a long press", async () => {
    const selectionPromise = showContextMenuFallback([{ id: "rename", label: "Rename" }]);
    let settled = false;
    void selectionPromise.then(() => {
      settled = true;
    });

    // The long press landed on the row, before this menu existed, so no
    // pointerdown was ever seen inside the menu.
    pointerClick(findButton("Rename"));
    await flushMicrotasks();
    expect(settled).toBe(false);

    // A genuine tap presses inside the menu first.
    const renameButton = findButton("Rename");
    if (renameButton) pointerDownInside(renameButton);
    pointerClick(renameButton);

    await expect(selectionPromise).resolves.toBe("rename");
  });

  it("opens a submenu from a touch pointerup and resolves the tapped leaf", async () => {
    const selectionPromise = showContextMenuFallback([
      {
        id: "snooze",
        label: "Snooze",
        children: [
          { id: "snooze:1h", label: "1 hour" },
          { id: "snooze:tomorrow", label: "Tomorrow" },
        ],
      },
    ]);

    const parentButton = findButton("Snooze");
    expect(parentButton).toBeTruthy();
    parentButton?.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch" }));

    const childButton = findButton("Tomorrow");
    expect(childButton).toBeTruthy();
    if (childButton) pointerDownInside(childButton);
    pointerClick(childButton);

    await expect(selectionPromise).resolves.toBe("snooze:tomorrow");
  });

  it("leaves submenus to hover for a mouse pointerup", async () => {
    const selectionPromise = showContextMenuFallback([
      { id: "snooze", label: "Snooze", children: [{ id: "snooze:1h", label: "1 hour" }] },
    ]);

    findButton("Snooze")?.dispatchEvent(new PointerEvent("pointerup", { pointerType: "mouse" }));
    expect(findButton("1 hour")).toBeUndefined();

    (document as unknown as FakeDocument).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    );
    await expect(selectionPromise).resolves.toBeNull();
  });

  it("does not rebuild a submenu that is already open", async () => {
    const selectionPromise = showContextMenuFallback([
      { id: "snooze", label: "Snooze", children: [{ id: "snooze:1h", label: "1 hour" }] },
    ]);

    const parentButton = findButton("Snooze");
    parentButton?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const firstChild = findButton("1 hour");

    parentButton?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    parentButton?.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch" }));

    expect(findButton("1 hour")).toBe(firstChild);

    if (firstChild) pointerDownInside(firstChild);
    pointerClick(firstChild);
    await expect(selectionPromise).resolves.toBe("snooze:1h");
  });
});
