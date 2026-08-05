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
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceDictationModel } from "@t3tools/contracts/settings";

import {
  openTranscriptionSession,
  type TranscriptionSession,
} from "../lib/voiceDictation/openaiRealtime";
import { startPcmCapture, type PcmCaptureHandle } from "../lib/voiceDictation/pcmCapture";

export type VoiceDictationStatus = "idle" | "starting" | "listening" | "finishing";

export interface VoiceDictationControls {
  readonly status: VoiceDictationStatus;
  readonly start: () => void;
  readonly stop: () => void;
}

export interface UseVoiceDictationInput {
  readonly apiKey: string;
  readonly model: VoiceDictationModel;
  readonly language: string;
  /** Called when a hold begins, before any text arrives. */
  readonly onDictationStart: () => void;
  /** The full text dictated so far in this hold. */
  readonly onTranscript: (text: string) => void;
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
  }
  return "Could not start the microphone.";
}

export function useVoiceDictation(input: UseVoiceDictationInput): VoiceDictationControls {
  const [status, setStatus] = useState<VoiceDictationStatus>("idle");
  const captureRef = useRef<PcmCaptureHandle | null>(null);
  const sessionRef = useRef<TranscriptionSession | null>(null);
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

  const start = useCallback(() => {
    if (statusRef.current !== "idle") return;
    setDictationStatus("starting");
    inputRef.current.onDictationStart();

    void (async () => {
      try {
        const session = openTranscriptionSession({
          apiKey: inputRef.current.apiKey,
          model: inputRef.current.model,
          language: inputRef.current.language,
          onTranscript: (text) => inputRef.current.onTranscript(text),
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
    if (statusRef.current === "idle" || statusRef.current === "finishing") return;
    // A release during "starting" is handled by the start path above, which
    // sees the status change and unwinds itself.
    const wasListening = statusRef.current === "listening";
    setDictationStatus(wasListening ? "finishing" : "idle");

    void (async () => {
      const session = await teardown();
      await session?.finish().catch(() => {});
      setDictationStatus("idle");
      inputRef.current.onDictationEnd();
    })();
  }, [setDictationStatus, teardown]);

  useEffect(
    () => () => {
      void captureRef.current?.stop().catch(() => {});
      sessionRef.current?.close();
      captureRef.current = null;
      sessionRef.current = null;
    },
    [],
  );

  return { status, start, stop };
}
