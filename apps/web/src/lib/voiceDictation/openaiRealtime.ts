/**
 * A single dictation hold, spoken straight into OpenAI's realtime
 * transcription endpoint.
 *
 * The browser opens the socket itself rather than proxying through our server:
 * the audio never has to cross the WebSocket link to the environment, which
 * matters most for the remote and tunnelled clients where that link is the
 * slow one. The cost is that the user's key is in the client — see the note on
 * `VoiceDictationSettings.openaiApiKey`.
 *
 * Two things about the endpoint are deliberately defensive. The handshake is
 * tried with and without the beta subprotocol, and the session config is sent
 * in the current shape with the older one as a fallback, because this API has
 * changed shape more than once and a wrong guess is a feature that silently
 * never works. Both fallbacks cost one round trip and only run when the first
 * attempt is rejected.
 */
import { normalizeOpenAiApiKey } from "./apiKey";
import {
  appendTranscriptDelta,
  completeTranscriptItem,
  emptyTranscript,
  isTranscriptSettled,
  renderTranscript,
  type TranscriptState,
} from "./transcript";
import { DICTATION_SAMPLE_RATE } from "./pcmCapture";

const REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
/** How long `finish()` waits for a transcript it has already started hearing. */
const FINALIZE_TIMEOUT_MS = 4_000;
/** The shorter wait when nothing has come back yet — a hold with no speech. */
const FINALIZE_GRACE_MS = 1_200;

export interface TranscriptionSessionOptions {
  readonly apiKey: string;
  readonly model: string;
  /** ISO-639-1 code, or empty to let the model detect the language. */
  readonly language: string;
  readonly onTranscript: (text: string) => void;
  readonly onError: (message: string) => void;
}

export interface TranscriptionSession {
  readonly sendAudio: (pcm: ArrayBuffer) => void;
  /** Commits the audio, waits for the final transcript, then closes. */
  readonly finish: () => Promise<void>;
  /** Drops the socket without waiting for anything. */
  readonly close: () => void;
}

function subprotocolCandidates(apiKey: string): ReadonlyArray<ReadonlyArray<string>> {
  // The key goes on the wire as a token, so it is normalized here as well as
  // in settings: a stored value from before that normalization existed would
  // otherwise still make the constructor throw.
  const auth = `openai-insecure-api-key.${normalizeOpenAiApiKey(apiKey)}`;
  return [
    ["realtime", auth],
    ["realtime", auth, "openai-beta.realtime-v1"],
  ];
}

function encodeBase64(pcm: ArrayBuffer): string {
  const bytes = new Uint8Array(pcm);
  let binary = "";
  // Chunked because `String.fromCharCode(...bytes)` blows the argument limit
  // on anything but the smallest buffers.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function sessionUpdateEvent(options: TranscriptionSessionOptions) {
  const language = options.language.trim();
  return {
    type: "session.update",
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: DICTATION_SAMPLE_RATE },
          transcription: {
            model: options.model,
            ...(language.length > 0 ? { languages: [language] } : {}),
          },
          // The hold is the turn boundary, so server-side speech detection
          // would only fight the button.
          turn_detection: null,
        },
      },
    },
  };
}

/** The pre-GA shape, kept as a fallback for servers that reject the above. */
function legacySessionUpdateEvent(options: TranscriptionSessionOptions) {
  const language = options.language.trim();
  return {
    type: "transcription_session.update",
    session: {
      input_audio_format: "pcm16",
      input_audio_transcription: {
        model: options.model,
        ...(language.length > 0 ? { language } : {}),
      },
      turn_detection: null,
    },
  };
}

function readErrorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  return "OpenAI rejected the transcription session.";
}

export function openTranscriptionSession(
  options: TranscriptionSessionOptions,
): TranscriptionSession {
  const candidates = subprotocolCandidates(options.apiKey);
  let candidateIndex = 0;
  let socket: WebSocket | null = null;
  let opened = false;
  let closed = false;
  let sessionAcknowledged = false;
  let triedLegacyShape = false;
  let audioSent = false;
  let transcript: TranscriptState = emptyTranscript;
  const pending: string[] = [];
  let onSettled: (() => void) | null = null;

  const send = (event: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };

  const flushPending = () => {
    while (pending.length > 0) {
      const audio = pending.shift();
      if (audio) send({ type: "input_audio_buffer.append", audio });
    }
  };

  const publishTranscript = () => {
    options.onTranscript(renderTranscript(transcript));
    if (isTranscriptSettled(transcript)) onSettled?.();
  };

  const handleEvent = (payload: Record<string, unknown>) => {
    const type = typeof payload["type"] === "string" ? (payload["type"] as string) : "";
    const itemId = typeof payload["item_id"] === "string" ? (payload["item_id"] as string) : "item";

    if (type === "conversation.item.input_audio_transcription.delta") {
      const delta = typeof payload["delta"] === "string" ? (payload["delta"] as string) : "";
      transcript = appendTranscriptDelta(transcript, itemId, delta);
      publishTranscript();
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const text =
        typeof payload["transcript"] === "string" ? (payload["transcript"] as string) : "";
      transcript = completeTranscriptItem(transcript, itemId, text);
      publishTranscript();
      return;
    }

    // Only `.updated` counts: `session.created` is the greeting the server
    // sends before it has even seen our config, so treating it as an
    // acknowledgement would disable the fallback below.
    if (type.endsWith(".updated")) {
      sessionAcknowledged = true;
      return;
    }

    if (type === "error") {
      // An error before the session was ever acknowledged means the config
      // shape was rejected, not the audio. Retry once in the older shape
      // before telling the user anything.
      if (!sessionAcknowledged && !triedLegacyShape) {
        triedLegacyShape = true;
        send(legacySessionUpdateEvent(options));
        return;
      }
      options.onError(readErrorMessage(payload));
    }
  };

  const connect = () => {
    if (closed) return;
    const protocols = candidates[candidateIndex];
    if (!protocols) {
      options.onError("Could not reach OpenAI. Check the API key in Settings.");
      return;
    }

    const next = new WebSocket(REALTIME_URL, [...protocols]);
    socket = next;

    next.addEventListener("open", () => {
      opened = true;
      send(sessionUpdateEvent(options));
      flushPending();
    });

    next.addEventListener("message", (event: MessageEvent<string>) => {
      if (typeof event.data !== "string") return;
      try {
        handleEvent(JSON.parse(event.data) as Record<string, unknown>);
      } catch {
        // A frame we cannot parse is not worth interrupting dictation for.
      }
    });

    // No `error` listener: a socket error is always followed by `close`, which
    // is where the decision to retry or give up already lives.
    next.addEventListener("close", () => {
      if (closed) return;
      if (!opened) {
        // A handshake that never opened means the subprotocol set was
        // refused; the next candidate is the only thing worth changing.
        candidateIndex += 1;
        connect();
        return;
      }
      onSettled?.();
    });
  };

  connect();

  return {
    sendAudio: (pcm) => {
      if (closed) return;
      audioSent = true;
      const audio = encodeBase64(pcm);
      if (socket?.readyState === WebSocket.OPEN) {
        send({ type: "input_audio_buffer.append", audio });
        return;
      }
      pending.push(audio);
    },

    finish: async () => {
      if (closed) return;
      flushPending();
      // Nothing was captured, so there is no turn to commit and nothing to
      // wait for — a hold short enough to be a mis-tap lands here.
      if (audioSent) {
        send({ type: "input_audio_buffer.commit" });
        const heardSomething = transcript.segments.length > 0;
        if (!heardSomething || !isTranscriptSettled(transcript)) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(
              resolve,
              heardSomething ? FINALIZE_TIMEOUT_MS : FINALIZE_GRACE_MS,
            );
            onSettled = () => {
              clearTimeout(timer);
              resolve();
            };
          });
        }
      }
      closed = true;
      onSettled = null;
      socket?.close();
      socket = null;
    },

    close: () => {
      closed = true;
      onSettled = null;
      socket?.close();
      socket = null;
    },
  };
}
