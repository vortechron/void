export type AgentNotificationPermission = NotificationPermission | "unsupported";

function readNotificationApi(): typeof Notification | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return window.Notification;
}

export function readAgentNotificationPermission(): AgentNotificationPermission {
  return readNotificationApi()?.permission ?? "unsupported";
}

export async function requestAgentNotificationPermission(): Promise<AgentNotificationPermission> {
  const notificationApi = readNotificationApi();
  if (!notificationApi) return "unsupported";
  if (notificationApi.permission !== "default") return notificationApi.permission;

  try {
    return await notificationApi.requestPermission();
  } catch {
    return notificationApi.permission;
  }
}

export function showAgentCompletionNotification(input: {
  readonly threadTitle: string;
  readonly tag: string;
  readonly onOpen: () => void;
}): boolean {
  const NotificationApi = readNotificationApi();
  if (!NotificationApi || NotificationApi.permission !== "granted") return false;

  try {
    const notification = new NotificationApi("Agent finished working", {
      body: input.threadTitle,
      tag: input.tag,
    });
    notification.addEventListener("click", () => {
      window.focus();
      input.onOpen();
      notification.close();
    });
    return true;
  } catch {
    return false;
  }
}
