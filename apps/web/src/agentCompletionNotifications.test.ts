import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readAgentNotificationPermission,
  requestAgentNotificationPermission,
  showAgentCompletionNotification,
} from "./agentCompletionNotifications";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installNotificationApi(permission: NotificationPermission) {
  const notifications: Array<{
    readonly title: string;
    readonly options: NotificationOptions | undefined;
    click: (() => void) | null;
    readonly close: ReturnType<typeof vi.fn>;
  }> = [];
  const requestPermission = vi.fn(async () => "granted" as NotificationPermission);

  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;
    click: (() => void) | null = null;
    readonly close = vi.fn();
    readonly title: string;
    readonly options: NotificationOptions | undefined;

    constructor(title: string, options?: NotificationOptions) {
      this.title = title;
      this.options = options;
      notifications.push(this);
    }

    addEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
      this.click = () => {
        if (typeof listener === "function") {
          listener({} as Event);
        } else {
          listener.handleEvent({} as Event);
        }
      };
    }
  }

  const focus = vi.fn();
  vi.stubGlobal("window", {
    Notification: FakeNotification,
    focus,
  });

  return { notifications, requestPermission, focus };
}

describe("agent completion notification permission", () => {
  it("reports unsupported browsers without requesting permission", async () => {
    vi.stubGlobal("window", {});

    expect(readAgentNotificationPermission()).toBe("unsupported");
    await expect(requestAgentNotificationPermission()).resolves.toBe("unsupported");
  });

  it("requests undecided permission from the browser", async () => {
    const { requestPermission } = installNotificationApi("default");

    await expect(requestAgentNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("showAgentCompletionNotification", () => {
  it("opens the completed thread from a granted notification", () => {
    const { notifications, focus } = installNotificationApi("granted");
    const onOpen = vi.fn();

    expect(
      showAgentCompletionNotification({
        threadTitle: "Add completion alerts",
        tag: "completion-1",
        onOpen,
      }),
    ).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      title: "Agent finished working",
      options: {
        body: "Add completion alerts",
        tag: "completion-1",
      },
    });

    notifications[0]?.click?.();

    expect(focus).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(notifications[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("does nothing before permission is granted", () => {
    const { notifications } = installNotificationApi("default");

    expect(
      showAgentCompletionNotification({
        threadTitle: "Add completion alerts",
        tag: "completion-1",
        onOpen: vi.fn(),
      }),
    ).toBe(false);
    expect(notifications).toEqual([]);
  });
});
