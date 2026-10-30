import { Volume2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CLIENT_SETTINGS, type CompletionSound } from "@t3tools/contracts/settings";

import {
  readAgentNotificationPermission,
  requestAgentNotificationPermission,
} from "../../agentCompletionNotifications";
import { playCompletionSound, prepareCompletionSound } from "../../completionSound";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const COMPLETION_SOUND_LABELS: Readonly<Record<CompletionSound, string>> = {
  none: "None",
  chime: "Chime",
};

/** Rows only: General renders them inside its Notifications section. */
export function AgentCompletionSettings() {
  const notificationsEnabled = useClientSettings((settings) => settings.agentNotificationsEnabled);
  const completionSound = useClientSettings((settings) => settings.completionSound);
  const updateSettings = useUpdateClientSettings();
  const [notificationPermission, setNotificationPermission] = useState(
    readAgentNotificationPermission,
  );
  const [requestingPermission, setRequestingPermission] = useState(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window focus listener rereads the browser notification permission
  useEffect(() => {
    const refreshPermission = () => {
      setNotificationPermission(readAgentNotificationPermission());
    };
    window.addEventListener("focus", refreshPermission);
    return () => window.removeEventListener("focus", refreshPermission);
  }, []);

  const updateNotificationsEnabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        updateSettings({ agentNotificationsEnabled: false });
        return;
      }

      setRequestingPermission(true);
      const permission = await requestAgentNotificationPermission();
      setNotificationPermission(permission);
      setRequestingPermission(false);
      if (permission === "granted") {
        updateSettings({ agentNotificationsEnabled: true });
        return;
      }

      toastManager.add(
        stackedThreadToast({
          type: "warning",
          title:
            permission === "unsupported"
              ? "Notifications are unavailable"
              : "Notifications are blocked",
          description:
            permission === "unsupported"
              ? "This client does not support system notifications."
              : "Allow notifications in your browser or system settings, then try again.",
        }),
      );
    },
    [updateSettings],
  );

  const notificationStatus =
    notificationPermission === "unsupported"
      ? "System notifications are unavailable in this client."
      : notificationPermission === "denied"
        ? "Blocked by browser or system settings."
        : notificationsEnabled && notificationPermission !== "granted"
          ? "Permission is required before alerts can appear."
          : undefined;

  return (
    <>
      <SettingsRow
        {...searchableSetting("agent-notifications")}
        description="Get notified when an agent finishes working."
        status={notificationStatus}
        resetAction={
          notificationsEnabled !== DEFAULT_CLIENT_SETTINGS.agentNotificationsEnabled ? (
            <SettingResetButton
              label="agent notifications"
              onClick={() =>
                updateSettings({
                  agentNotificationsEnabled: DEFAULT_CLIENT_SETTINGS.agentNotificationsEnabled,
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            checked={notificationsEnabled}
            disabled={requestingPermission}
            onCheckedChange={(checked) => {
              void updateNotificationsEnabled(Boolean(checked));
            }}
            aria-label="Notify when an agent finishes working"
          />
        }
      />

      <SettingsRow
        {...searchableSetting("completion-sound")}
        description="Choose what plays when an agent finishes working in a chat."
        resetAction={
          completionSound !== DEFAULT_CLIENT_SETTINGS.completionSound ? (
            <SettingResetButton
              label="completion sound"
              onClick={() =>
                updateSettings({ completionSound: DEFAULT_CLIENT_SETTINGS.completionSound })
              }
            />
          ) : null
        }
        control={
          <>
            <Select
              value={completionSound}
              onValueChange={(value) => {
                if (value !== "none" && value !== "chime") return;
                if (value === "chime") {
                  void prepareCompletionSound();
                }
                updateSettings({ completionSound: value });
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Completion sound">
                <SelectValue>{COMPLETION_SOUND_LABELS[completionSound]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="chime">
                  {COMPLETION_SOUND_LABELS.chime}
                </SelectItem>
                <SelectItem hideIndicator value="none">
                  {COMPLETION_SOUND_LABELS.none}
                </SelectItem>
              </SelectPopup>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={completionSound === "none"}
              onClick={() => {
                void playCompletionSound(completionSound);
              }}
            >
              <Volume2Icon className="size-4" />
              Test
            </Button>
          </>
        }
      />
    </>
  );
}
