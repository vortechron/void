import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import {
  createAgentCompletionTrackerState,
  detectAgentCompletions,
} from "../agentCompletionAlerts";
import { showAgentCompletionNotification } from "../agentCompletionNotifications";
import { playCompletionSound, prepareCompletionSound } from "../completionSound";
import { useClientSettings, useClientSettingsHydrated } from "../hooks/useSettings";
import { useAllEnvironmentShellsBootstrapped, useThreadShells } from "../state/entities";

export function AgentCompletionCoordinator() {
  const navigate = useNavigate();
  const threads = useThreadShells();
  const shellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const settingsHydrated = useClientSettingsHydrated();
  const notificationsEnabled = useClientSettings((settings) => settings.agentNotificationsEnabled);
  const completionSound = useClientSettings((settings) => settings.completionSound);
  const trackerState = useRef(createAgentCompletionTrackerState());

  useEffect(() => {
    if (!settingsHydrated || completionSound === "none") return;

    const prepare = () => {
      window.removeEventListener("pointerdown", prepare, true);
      window.removeEventListener("keydown", prepare, true);
      void prepareCompletionSound();
    };
    window.addEventListener("pointerdown", prepare, true);
    window.addEventListener("keydown", prepare, true);
    return () => {
      window.removeEventListener("pointerdown", prepare, true);
      window.removeEventListener("keydown", prepare, true);
    };
  }, [completionSound, settingsHydrated]);

  useEffect(() => {
    const result = detectAgentCompletions({
      state: trackerState.current,
      threads,
      bootstrapped: settingsHydrated && shellsBootstrapped,
    });
    trackerState.current = result.state;
    if (result.completions.length === 0) return;

    void playCompletionSound(completionSound);
    if (!notificationsEnabled) return;

    for (const thread of result.completions) {
      const turnId = thread.latestRun?.runId;
      if (!turnId) continue;
      showAgentCompletionNotification({
        threadTitle: thread.title,
        tag: `agent-completion:${scopedThreadKey({
          environmentId: thread.environmentId,
          threadId: thread.id,
        })}:${turnId}`,
        onOpen: () => {
          void navigate({
            to: "/$environmentId/$threadId",
            params: {
              environmentId: thread.environmentId,
              threadId: thread.id,
            },
          });
        },
      });
    }
  }, [
    completionSound,
    navigate,
    notificationsEnabled,
    settingsHydrated,
    shellsBootstrapped,
    threads,
  ]);

  return null;
}
