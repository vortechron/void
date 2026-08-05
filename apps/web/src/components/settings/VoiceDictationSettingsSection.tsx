/**
 * Settings for hold-to-talk dictation on the composer's send button.
 *
 * The key entered here goes to OpenAI from the client that is doing the
 * talking, not from the server, so it is stored with the rest of this
 * environment's settings and shared with every client paired to it.
 */
import {
  DEFAULT_VOICE_DICTATION_MODEL,
  type VoiceDictationModel,
  type VoiceDictationSettings,
} from "@t3tools/contracts/settings";
import { useCallback } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { canCaptureAudio } from "../../lib/voiceDictation/pcmCapture";
import { resolveVoiceDictationAvailability } from "../../lib/voiceDictation/availability";
import { DraftInput } from "../ui/draft-input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const MODEL_OPTIONS: ReadonlyArray<{ value: VoiceDictationModel; label: string }> = [
  { value: "gpt-live-transcribe", label: "Live transcribe" },
  { value: "gpt-transcribe", label: "Transcribe" },
];

export function VoiceDictationSettingsSection() {
  const voiceDictation = usePrimarySettings((settings) => settings.voiceDictation);
  const updateSettings = useUpdatePrimarySettings();

  // The blob is replaced whole, so every write starts from the current value.
  const patchVoiceDictation = useCallback(
    (patch: Partial<VoiceDictationSettings>) => {
      updateSettings({ voiceDictation: { ...voiceDictation, ...patch } });
    },
    [updateSettings, voiceDictation],
  );

  const availability = resolveVoiceDictationAvailability({
    enabled: voiceDictation.enabled,
    apiKey: voiceDictation.openaiApiKey,
    isSecureContext: typeof window !== "undefined" && window.isSecureContext,
    canCaptureAudio: canCaptureAudio(),
  });
  const isOff = !voiceDictation.enabled;
  // "Off" is the state this page is for changing, so it is not worth a warning.
  const blockedStatus =
    availability.blockedReason === null || availability.blockedReason === "disabled"
      ? null
      : availability.message;

  return (
    <SettingsSection id="voice-dictation" title="Voice dictation">
      <SettingsRow
        {...searchableSetting("voice-dictation")}
        description="Hold the send button in the chat box to talk. Audio streams to OpenAI as you speak and the text appears in the composer; nothing is recorded to a file."
        status={blockedStatus}
        resetAction={
          voiceDictation.enabled ? (
            <SettingResetButton
              label="voice dictation"
              onClick={() => patchVoiceDictation({ enabled: false })}
            />
          ) : null
        }
        control={
          <Switch
            checked={voiceDictation.enabled}
            onCheckedChange={(checked) => patchVoiceDictation({ enabled: Boolean(checked) })}
            aria-label="Hold the send button to dictate"
          />
        }
      />

      <SettingsRow
        {...searchableSetting("voice-dictation-api-key")}
        description="Your own OpenAI key, used only for transcription. It is stored with this environment's settings and sent to the clients paired with it, because the browser is what opens the connection to OpenAI."
        control={
          <DraftInput
            type="password"
            autoComplete="off"
            spellCheck={false}
            disabled={isOff}
            className="w-full sm:w-64"
            placeholder="sk-..."
            aria-label="OpenAI API key"
            value={voiceDictation.openaiApiKey}
            onCommit={(next) => patchVoiceDictation({ openaiApiKey: next.trim() })}
          />
        }
      />

      <SettingsRow
        {...searchableSetting("voice-dictation-model")}
        description="Live transcribe writes words as you say them. Transcribe waits until you release the button, and is worth trying if live results come back wrong."
        resetAction={
          voiceDictation.model !== DEFAULT_VOICE_DICTATION_MODEL ? (
            <SettingResetButton
              label="dictation model"
              onClick={() => patchVoiceDictation({ model: DEFAULT_VOICE_DICTATION_MODEL })}
            />
          ) : null
        }
        control={
          <Select
            disabled={isOff}
            value={voiceDictation.model}
            onValueChange={(value) => {
              const model = MODEL_OPTIONS.find((option) => option.value === value)?.value;
              if (model) patchVoiceDictation({ model });
            }}
          >
            <SelectTrigger aria-label="Dictation model" className="w-full sm:w-44">
              <SelectValue>
                {MODEL_OPTIONS.find((option) => option.value === voiceDictation.model)?.label ??
                  voiceDictation.model}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem hideIndicator key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        {...searchableSetting("voice-dictation-language")}
        description="A two-letter language code such as en or ms. Leave it blank to let the model work out what it is hearing."
        resetAction={
          voiceDictation.language.length > 0 ? (
            <SettingResetButton
              label="dictation language"
              onClick={() => patchVoiceDictation({ language: "" })}
            />
          ) : null
        }
        control={
          <DraftInput
            disabled={isOff}
            className="w-full sm:w-24"
            placeholder="Auto"
            spellCheck={false}
            aria-label="Dictation language"
            value={voiceDictation.language}
            onCommit={(next) => patchVoiceDictation({ language: next.trim().toLowerCase() })}
          />
        }
      />
    </SettingsSection>
  );
}
