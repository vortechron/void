/**
 * Hold-to-talk dictation for the composer.
 *
 * One hold is one session: the microphone opens, audio streams to OpenAI, the
 * transcript is handed back as it arrives, and everything is torn down on
 * release. Nothing is buffered to disk and no recording outlives the hold.
 *
 * The caller owns the text. This hook only reports the dictated string for the
 * current hold, cumulatively, so the composer can keep replacing one span
 * rather than reconciling a stream of appends.
 *
 * Two passes shape that string. Snippets expand while the user is still
 * talking, because they are plain text replacement and cost nothing. The
 * cleanup pass runs once, after the hold winds down, and is reported through a
 * separate callback carrying the text it replaces — the composer needs both to
 * tell a stale result from a current one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  VoiceDictationModel,
  VoiceDictationSnippet,
  VoiceDictationStyle,
} from "@t3tools/contracts/settings";

import { playDictationCue } from "../lib/voiceDictation/dictationCues";
import {
  openTranscriptionSession,
  type TranscriptionSession,
} from "../lib/voiceDictation/openaiRealtime";
import { startPcmCapture, type PcmCaptureHandle } from "../lib/voiceDictation/pcmCapture";
import { polishTranscript, shouldPolish } from "../lib/voiceDictation/polish";
import { applySnippets } from "../lib/voiceDictation/snippets";

export type VoiceDictationStatus = "idle" | "starting" | "listening" | "finishing" | "polishing";

export interface VoiceDictationControls {
  readonly status: VoiceDictationStatus;
  readonly start: () => void;
  readonly stop: () => void;
}

export interface UseVoiceDictationInput {
  readonly apiKey: string;
  readonly model: VoiceDictationModel;
  readonly language: string;
  readonly style: VoiceDictationStyle;
  readonly styleInstructions: string;
  readonly polishModel: string;
  readonly dictionary: ReadonlyArray<string>;
  readonly snippets: ReadonlyArray<VoiceDictationSnippet>;
  /** Whether opening and closing the microphone makes a sound. */
  readonly soundCues: boolean;
  /** Called when a hold begins, before any text arrives. */
  readonly onDictationStart: () => void;
  /** The full text dictated so far in this hold. */
  readonly onTranscript: (text: string) => void;
  /**
   * The cleaned-up text, with the raw text it is meant to replace. Only fires
   * when the cleanup pass ran and came back with something usable.
   */
  readonly onPolished: (polished: string, raw: string) => void;
  /** Called once the hold has fully wound down, successfully or not. */
  readonly onDictationEnd: () => void;
  readonly onError: (message: string) => void;
}

function describeStartFailure(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was denied.";
    }
    if (error.name === "NotFoundError") {
      return "No microphone was found.";
    }
    // `new WebSocket()` throws this when the key cannot go in the handshake —
    // a settings problem, and blaming the microphone sends the user looking in
    // the wrong place entirely.
    if (error.name === "SyntaxError") {
      return "The OpenAI API key looks wrong. Check it in Settings → Voice.";
    }
  }
  return "Could not start the microphone.";
}

export function useVoiceDictation(input: UseVoiceDictationInput): VoiceDictationControls {
  const [status, setStatus] = useState<VoiceDictationStatus>("idle");
  const captureRef = useRef<PcmCaptureHandle | null>(null);
  const sessionRef = useRef<TranscriptionSession | null>(null);
  // The last text handed to the caller this hold, which is what the cleanup
  // pass rewrites and what the caller checks the result against.
  const lastTranscriptRef = useRef("");
  const polishAbortRef = useRef<AbortController | null>(null);
  // Read through a ref so a settings change mid-hold cannot swap the callbacks
  // out from under an in-flight session, and so `start`/`stop` keep stable
  // identities for the memoized button that holds them.
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });
  const statusRef = useRef<VoiceDictationStatus>("idle");

  const setDictationStatus = useCallback((next: VoiceDictationStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const teardown = useCallback(async () => {
    const capture = captureRef.current;
    const session = sessionRef.current;
    captureRef.current = null;
    sessionRef.current = null;
    await capture?.stop().catch(() => {});
    return session;
  }, []);

  /**
   * Rewrites what was dictated, once the transcript has settled. Everything
   * here is best-effort: a pass that cannot run leaves the raw words in the
   * composer, which is the behaviour dictation had before it existed.
   */
  const runPolishPass = useCallback(async () => {
    const current = inputRef.current;
    const raw = lastTranscriptRef.current;
    if (
      !shouldPolish({
        style: current.style,
        apiKey: current.apiKey,
        model: current.polishModel,
        transcript: raw,
      })
    ) {
      return;
    }

    const abort = new AbortController();
    polishAbortRef.current = abort;
    setDictationStatus("polishing");
    try {
      const polished = await polishTranscript({
        apiKey: current.apiKey,
        model: current.polishModel,
        transcript: raw,
        style: current.style,
        styleInstructions: current.styleInstructions,
        dictionary: current.dictionary,
        signal: abort.signal,
      });
      // `polished === raw` is a pass that found nothing to fix; replacing the
      // span with identical text would only cost the caller an undo step.
      if (!abort.signal.aborted && polished !== null && polished !== raw) {
        inputRef.current.onPolished(polished, raw);
      }
    } finally {
      if (polishAbortRef.current === abort) polishAbortRef.current = null;
    }
  }, [setDictationStatus]);

  const start = useCallback(() => {
    if (statusRef.current !== "idle") return;
    // A hold that starts while the previous one is still being cleaned up owns
    // the composer now; the older result would land on top of it.
    polishAbortRef.current?.abort();
    polishAbortRef.current = null;
    lastTranscriptRef.current = "";
    setDictationStatus("starting");
    inputRef.current.onDictationStart();

    void (async () => {
      try {
        const session = openTranscriptionSession({
          apiKey: inputRef.current.apiKey,
          model: inputRef.current.model,
          language: inputRef.current.language,
          dictionary: inputRef.current.dictionary,
          onTranscript: (text) => {
            const expanded = applySnippets(text, inputRef.current.snippets);
            lastTranscriptRef.current = expanded;
            inputRef.current.onTranscript(expanded);
          },
          onError: (message) => inputRef.current.onError(message),
        });
        sessionRef.current = session;

        captureRef.current = await startPcmCapture({
          onChunk: (pcm) => session.sendAudio(pcm),
        });

        // A release that beat the microphone opening already reset the status;
        // honour it rather than starting to listen after the button came up.
        if (statusRef.current !== "starting") {
          await captureRef.current.stop().catch(() => {});
          captureRef.current = null;
          session.close();
          sessionRef.current = null;
          return;
        }
        // The cue belongs here rather than on the press: this is the first
        // moment the microphone is genuinely open, and a sound that plays
        // before that would promise words are being heard when they are not.
        playDictationCue("start", inputRef.current.soundCues);
        setDictationStatus("listening");
      } catch (error) {
        sessionRef.current?.close();
        sessionRef.current = null;
        captureRef.current = null;
        setDictationStatus("idle");
        inputRef.current.onError(describeStartFailure(error));
        inputRef.current.onDictationEnd();
      }
    })();
  }, [setDictationStatus]);

  const stop = useCallback(() => {
    if (
      statusRef.current === "idle" ||
      statusRef.current === "finishing" ||
      statusRef.current === "polishing"
    ) {
      return;
    }
    // A release during "starting" is handled by the start path above, which
    // sees the status change and unwinds itself.
    const wasListening = statusRef.current === "listening";
    // Only a session that was actually listening gets a closing cue; one that
    // never opened has nothing to say it stopped.
    if (wasListening) playDictationCue("stop", inputRef.current.soundCues);
    setDictationStatus(wasListening ? "finishing" : "idle");

    void (async () => {
      const session = await teardown();
      await session?.finish().catch(() => {});
      await runPolishPass();
      setDictationStatus("idle");
      inputRef.current.onDictationEnd();
    })();
  }, [runPolishPass, setDictationStatus, teardown]);

  useEffect(
    () => () => {
      void captureRef.current?.stop().catch(() => {});
      sessionRef.current?.close();
      polishAbortRef.current?.abort();
      captureRef.current = null;
      sessionRef.current = null;
      polishAbortRef.current = null;
    },
    [],
  );

  return { status, start, stop };
}
