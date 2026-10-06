/**
 * Settings for hold-to-talk dictation on the composer's send button.
 *
 * The key entered here goes to OpenAI from the client that is doing the
 * talking, not from the server, so it is stored with the rest of this
 * environment's settings and shared with every client paired to it.
 */
import {
  DEFAULT_VOICE_DICTATION_MODEL,
  DEFAULT_VOICE_DICTATION_POLISH_MODEL,
  DEFAULT_VOICE_DICTATION_STYLE,
  type VoiceDictationModel,
  type VoiceDictationSettings,
  type VoiceDictationStyle,
} from "@t3tools/contracts/settings";
import { useCallback } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { normalizeOpenAiApiKey } from "../../lib/voiceDictation/apiKey";
import { parseDictationLanguages } from "../../lib/voiceDictation/languages";
import { canCaptureAudio } from "../../lib/voiceDictation/pcmCapture";
import { resolveVoiceDictationAvailability } from "../../lib/voiceDictation/availability";
import { DraftInput } from "../ui/draft-input";
import { SecretDraftInput } from "../ui/secret-draft-input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const MODEL_OPTIONS: ReadonlyArray<{ value: VoiceDictationModel; label: string }> = [
  { value: "gpt-live-transcribe", label: "Live transcribe" },
  { value: "gpt-transcribe", label: "Transcribe" },
];

const STYLE_OPTIONS: ReadonlyArray<{ value: VoiceDictationStyle; label: string }> = [
  { value: "off", label: "Off" },
  { value: "cleanup", label: "Clean up" },
  { value: "rewrite", label: "Rewrite" },
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
  const cleanupIsOff = isOff || voiceDictation.style === "off";
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
          <SecretDraftInput
            autoComplete="off"
            spellCheck={false}
            disabled={isOff}
            className="w-full sm:w-64"
            placeholder="sk-..."
            aria-label="OpenAI API key"
            secretLabel="OpenAI API key"
            value={voiceDictation.openaiApiKey}
            onCommit={(next) => patchVoiceDictation({ openaiApiKey: normalizeOpenAiApiKey(next) })}
          />
        }
      />

      <SettingsRow
        {...searchableSetting("voice-dictation-sound-cues")}
        description="A short rising tone when the microphone opens and a falling one when it closes, plus a buzz on phones that support it. Turn it off in a quiet room — the button still shows what it is doing."
        resetAction={
          !voiceDictation.soundCues ? (
            <SettingResetButton
              label="dictation sounds"
              onClick={() => patchVoiceDictation({ soundCues: true })}
            />
          ) : null
        }
        control={
          <Switch
            disabled={isOff}
            checked={voiceDictation.soundCues}
            onCheckedChange={(checked) => patchVoiceDictation({ soundCues: Boolean(checked) })}
            aria-label="Dictation sounds"
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
        description="Language codes separated by commas, such as en, ms for English and Malay. Include each language you speak, even when you mix them. Leave it blank for automatic detection."
        resetAction={
          voiceDictation.language.length > 0 ? (
            <SettingResetButton
              label="dictation languages"
              onClick={() => patchVoiceDictation({ language: "" })}
            />
          ) : null
        }
        control={
          <DraftInput
            disabled={isOff}
            className="w-full sm:w-44"
            placeholder="Auto"
            spellCheck={false}
            aria-label="Dictation languages"
            value={voiceDictation.language}
            onCommit={(next) =>
              patchVoiceDictation({ language: parseDictationLanguages(next).join(", ") })
            }
          />
        }
      />

      <SettingsRow
        {...searchableSetting("voice-dictation-style")}
        description="What happens to the words once you stop talking. Clean up fixes punctuation, drops filler like “um”, and applies corrections you said out loud — “rename the file, no wait, the folder” becomes “rename the folder”. Rewrite also tightens rambling into clear sentences. Off leaves the transcript exactly as heard."
        resetAction={
          voiceDictation.style !== DEFAULT_VOICE_DICTATION_STYLE ? (
            <SettingResetButton
              label="cleanup style"
              onClick={() => patchVoiceDictation({ style: DEFAULT_VOICE_DICTATION_STYLE })}
            />
          ) : null
        }
        control={
          <Select
            disabled={isOff}
            value={voiceDictation.style}
            onValueChange={(value) => {
              const style = STYLE_OPTIONS.find((option) => option.value === value)?.value;
              if (style) patchVoiceDictation({ style });
            }}
          >
            <SelectTrigger aria-label="Cleanup style" className="w-full sm:w-44">
              <SelectValue>
                {STYLE_OPTIONS.find((option) => option.value === voiceDictation.style)?.label ??
                  voiceDictation.style}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {STYLE_OPTIONS.map((option) => (
                <SelectItem hideIndicator key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />

      <SettingsRow
        {...searchableSetting("voice-dictation-style-instructions")}
        description="Anything else the cleanup pass should know — house style, a language to keep replies in, words to avoid. Leave it blank unless the default result is not what you want."
        resetAction={
          voiceDictation.styleInstructions.length > 0 ? (
            <SettingResetButton
              label="cleanup instructions"
              onClick={() => patchVoiceDictation({ styleInstructions: "" })}
            />
          ) : null
        }
      >
        <Textarea
          disabled={cleanupIsOff}
          className="mt-3 mb-2 min-h-20 w-full"
          spellCheck={false}
          placeholder="Keep British spelling. Never turn my requests into bullet points."
          aria-label="Cleanup instructions"
          defaultValue={voiceDictation.styleInstructions}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (next !== voiceDictation.styleInstructions) {
              patchVoiceDictation({ styleInstructions: next });
            }
          }}
        />
      </SettingsRow>

      <SettingsRow
        {...searchableSetting("voice-dictation-polish-model")}
        description="The OpenAI model the cleanup pass runs on. A small, fast one is the right choice — this runs every time you stop talking. Change it only if OpenAI renames the default."
        resetAction={
          voiceDictation.polishModel !== DEFAULT_VOICE_DICTATION_POLISH_MODEL ? (
            <SettingResetButton
              label="cleanup model"
              onClick={() =>
                patchVoiceDictation({ polishModel: DEFAULT_VOICE_DICTATION_POLISH_MODEL })
              }
            />
          ) : null
        }
        control={
          <DraftInput
            disabled={cleanupIsOff}
            className="w-full sm:w-44"
            spellCheck={false}
            autoComplete="off"
            placeholder={DEFAULT_VOICE_DICTATION_POLISH_MODEL}
            aria-label="Cleanup model"
            value={voiceDictation.polishModel}
            onCommit={(next) =>
              patchVoiceDictation({
                polishModel: next.trim() || DEFAULT_VOICE_DICTATION_POLISH_MODEL,
              })
            }
          />
        }
      />
    </SettingsSection>
  );
}
