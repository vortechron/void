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
import { parseDictationLanguages } from "./languages";
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
/** A ceiling for setup and final transcription; completed turns finish immediately. */
const FINALIZE_TIMEOUT_MS = 30_000;

export interface TranscriptionSessionOptions {
  readonly apiKey: string;
  readonly model: string;
  /** Comma-separated language hints, or empty for automatic detection. */
  readonly language: string;
  /** Names and jargon to bias the transcription towards. */
  readonly dictionary: ReadonlyArray<string>;
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

/** Enough terms to bias the model, short enough to stay inside the hint's budget. */
const MAX_PROMPTED_DICTIONARY_TERMS = 60;
const MAX_DICTIONARY_PROMPT_LENGTH = 500;

/**
 * The dictionary as a vocabulary hint. The endpoint takes a free-text prompt
 * rather than a word list, and a bare comma-separated run of names is what it
 * biases best on.
 */
function dictionaryPrompt(dictionary: ReadonlyArray<string>): string {
  const terms = dictionary
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, MAX_PROMPTED_DICTIONARY_TERMS);
  if (terms.length === 0) return "";

  const prompt = terms.join(", ");
  return prompt.length <= MAX_DICTIONARY_PROMPT_LENGTH
    ? prompt
    : prompt.slice(0, prompt.lastIndexOf(", ", MAX_DICTIONARY_PROMPT_LENGTH));
}

function sessionUpdateEvent(options: TranscriptionSessionOptions) {
  const languages = parseDictationLanguages(options.language);
  const prompt = dictionaryPrompt(options.dictionary);
  return {
    type: "session.update",
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: DICTATION_SAMPLE_RATE },
          transcription: {
            model: options.model,
            ...(languages.length > 0 ? { languages } : {}),
            // Omitted when empty rather than sent blank: this field is the
            // newest part of the config shape, and a session that does not
            // need it should not be the one that discovers it is rejected.
            ...(prompt.length > 0 ? { prompt } : {}),
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
  const languages = parseDictationLanguages(options.language);
  const prompt = dictionaryPrompt(options.dictionary);
  return {
    type: "transcription_session.update",
    session: {
      input_audio_format: "pcm16",
      input_audio_transcription: {
        model: options.model,
        ...(languages.length > 0 ? { languages } : {}),
        ...(prompt.length > 0 ? { prompt } : {}),
      },
      turn_detection: null,
    },
  };
}

/**
 * Every session config worth trying, in order, until one is acknowledged.
 *
 * The first two are the current and pre-GA shapes. The last two repeat both
 * without the vocabulary hint, because that field is the newest thing here and
 * the failure it would otherwise cause is the worst one available: dictation
 * breaking outright for exactly the users who bothered to fill in a
 * dictionary. Losing the hint costs some spelling accuracy that the cleanup
 * pass gets a second go at; losing the session costs the whole feature.
 */
export function sessionConfigCandidates(
  options: TranscriptionSessionOptions,
): ReadonlyArray<unknown> {
  const shapes = [sessionUpdateEvent(options), legacySessionUpdateEvent(options)];
  if (dictionaryPrompt(options.dictionary).length === 0) return shapes;

  const withoutDictionary = { ...options, dictionary: [] };
  return [
    ...shapes,
    sessionUpdateEvent(withoutDictionary),
    legacySessionUpdateEvent(withoutDictionary),
  ];
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
  const sessionConfigs = sessionConfigCandidates(options);
  let sessionConfigIndex = 0;
  let socket: WebSocket | null = null;
  let opened = false;
  let closed = false;
  let sessionAcknowledged = false;
  let audioSent = false;
  let finishRequested = false;
  let finishPromise: Promise<void> | null = null;
  let commitSent = false;
  let committedItemId: string | null = null;
  let transcript: TranscriptState = emptyTranscript;
  const pending: string[] = [];
  let onSettled: (() => void) | null = null;

  const send = (event: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    onSettled?.();
    socket?.close();
    socket = null;
  };

  const flushPending = () => {
    if (!sessionAcknowledged || socket?.readyState !== WebSocket.OPEN) return;
    while (pending.length > 0) {
      const audio = pending.shift();
      if (audio) send({ type: "input_audio_buffer.append", audio });
    }
    if (finishRequested && !commitSent) {
      commitSent = true;
      send({ type: "input_audio_buffer.commit" });
    }
  };

  const settleCommittedTranscript = () => {
    // Earlier completed items cannot prove that the newly committed tail is done.
    if (
      committedItemId !== null &&
      transcript.segments.some(
        (segment) => segment.itemId === committedItemId && segment.final !== null,
      ) &&
      isTranscriptSettled(transcript)
    ) {
      close();
    }
  };

  const publishTranscript = () => {
    options.onTranscript(renderTranscript(transcript));
    settleCommittedTranscript();
  };

  const handleEvent = (payload: Record<string, unknown>) => {
    if (closed) return;
    const type = typeof payload["type"] === "string" ? (payload["type"] as string) : "";
    const itemId = typeof payload["item_id"] === "string" ? (payload["item_id"] as string) : "item";

    if (type === "input_audio_buffer.committed" && commitSent) {
      committedItemId = itemId;
      settleCommittedTranscript();
      return;
    }

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
    if (type === "session.updated" || type === "transcription_session.updated") {
      sessionAcknowledged = true;
      flushPending();
      return;
    }

    if (type === "conversation.item.input_audio_transcription.failed") {
      options.onError(readErrorMessage(payload));
      close();
      return;
    }

    if (type === "error") {
      // An error before the session was ever acknowledged means the config
      // was rejected, not the audio. Work down the shapes before telling the
      // user anything; only a config we have run out of retries for is worth
      // interrupting them over.
      if (!sessionAcknowledged) {
        sessionConfigIndex += 1;
        const nextConfig = sessionConfigs[sessionConfigIndex];
        if (nextConfig) {
          send(nextConfig);
          return;
        }
      }
      options.onError(readErrorMessage(payload));
      close();
    }
  };

  const connect = () => {
    if (closed) return;
    const protocols = candidates[candidateIndex];
    if (!protocols) {
      options.onError("Could not reach OpenAI. Check the API key in Settings.");
      close();
      return;
    }

    const next = new WebSocket(REALTIME_URL, [...protocols]);
    socket = next;

    next.addEventListener("open", () => {
      if (closed || socket !== next) return;
      opened = true;
      // A reconnect starts the shape ladder over: the socket that rejected a
      // config is not the one being talked to any more.
      sessionConfigIndex = 0;
      sessionAcknowledged = false;
      send(sessionConfigs[0]);
    });

    next.addEventListener("message", (event: MessageEvent<string>) => {
      if (closed || socket !== next) return;
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
      if (closed || socket !== next) return;
      if (!opened) {
        // A handshake that never opened means the subprotocol set was
        // refused; the next candidate is the only thing worth changing.
        candidateIndex += 1;
        connect();
        return;
      }
      options.onError("The OpenAI connection closed before dictation finished.");
      close();
    });
  };

  connect();

  return {
    sendAudio: (pcm) => {
      if (closed || finishRequested) return;
      audioSent = true;
      const audio = encodeBase64(pcm);
      pending.push(audio);
      flushPending();
    },

    finish: () => {
      if (finishPromise) return finishPromise;
      // Nothing was captured, so there is no turn to commit and nothing to
      // wait for — a hold short enough to be a mis-tap lands here.
      if (closed || !audioSent) {
        close();
        return Promise.resolve();
      }

      finishRequested = true;
      finishPromise = new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          options.onError(
            "OpenAI took too long to finish dictation. Any text received has been kept. Try again.",
          );
          close();
        }, FINALIZE_TIMEOUT_MS);
        onSettled = () => {
          clearTimeout(timer);
          onSettled = null;
          resolve();
        };
      }).then(close);
      flushPending();
      return finishPromise;
    },

    close,
  };
}
