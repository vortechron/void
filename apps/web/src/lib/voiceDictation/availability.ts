/**
 * Why hold-to-talk is or is not offered on the send button.
 *
 * Every blocker here is a standing condition rather than a runtime failure, so
 * the button can explain itself in a tooltip before the user presses it. A
 * remote client reached over plain HTTP is the one that surprises people: the
 * app works fine, but browsers refuse microphone access outside a secure
 * context, so the reason has to name the connection rather than the feature.
 */
export type VoiceDictationBlockedReason =
  | "disabled"
  | "missing-api-key"
  | "insecure-context"
  | "unsupported-browser";

export interface VoiceDictationAvailability {
  readonly available: boolean;
  readonly blockedReason: VoiceDictationBlockedReason | null;
  readonly message: string | null;
}

const BLOCKED_MESSAGES: Readonly<Record<VoiceDictationBlockedReason, string>> = {
  disabled: "Turn on voice dictation in Settings → General",
  "missing-api-key": "Add an OpenAI API key in Settings → General",
  "insecure-context": "Voice dictation needs an HTTPS or localhost connection",
  "unsupported-browser": "This browser cannot capture microphone audio",
};

export function voiceDictationBlockedMessage(reason: VoiceDictationBlockedReason): string {
  return BLOCKED_MESSAGES[reason];
}

export function resolveVoiceDictationAvailability(input: {
  readonly enabled: boolean;
  readonly apiKey: string;
  readonly isSecureContext: boolean;
  readonly canCaptureAudio: boolean;
}): VoiceDictationAvailability {
  const blockedReason: VoiceDictationBlockedReason | null = !input.enabled
    ? "disabled"
    : input.apiKey.trim().length === 0
      ? "missing-api-key"
      : !input.canCaptureAudio
        ? "unsupported-browser"
        : !input.isSecureContext
          ? "insecure-context"
          : null;

  return {
    available: blockedReason === null,
    blockedReason,
    message: blockedReason === null ? null : BLOCKED_MESSAGES[blockedReason],
  };
}
