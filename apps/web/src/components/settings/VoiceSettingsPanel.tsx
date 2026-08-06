/**
 * Everything about talking to the composer, on one page.
 *
 * These three sections used to be one row in General. They moved out together
 * because they only make sense next to each other: the dictionary changes what
 * is heard, snippets change what is written, and the cleanup style changes what
 * survives — and none of them mean anything with dictation switched off.
 */
import type { VoiceDictationSettings } from "@t3tools/contracts/settings";
import { useCallback } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { SettingsPageContainer } from "./settingsLayout";
import { VoiceDictationSettingsSection } from "./VoiceDictationSettingsSection";
import { VoiceDictionarySection } from "./VoiceDictionarySection";
import { VoiceSnippetsSection } from "./VoiceSnippetsSection";

export function VoiceSettingsPanel() {
  const voiceDictation = usePrimarySettings((settings) => settings.voiceDictation);
  const updateSettings = useUpdatePrimarySettings();

  // The blob is replaced whole, so every write starts from the current value.
  const patchVoiceDictation = useCallback(
    (patch: Partial<VoiceDictationSettings>) => {
      updateSettings({ voiceDictation: { ...voiceDictation, ...patch } });
    },
    [updateSettings, voiceDictation],
  );

  return (
    <SettingsPageContainer>
      <VoiceDictationSettingsSection />
      <VoiceDictionarySection
        dictionary={voiceDictation.dictionary}
        disabled={!voiceDictation.enabled}
        onChange={(dictionary) => patchVoiceDictation({ dictionary })}
      />
      <VoiceSnippetsSection
        snippets={voiceDictation.snippets}
        disabled={!voiceDictation.enabled}
        onChange={(snippets) => patchVoiceDictation({ snippets })}
      />
    </SettingsPageContainer>
  );
}
