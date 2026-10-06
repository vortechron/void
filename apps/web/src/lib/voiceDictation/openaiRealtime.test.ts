import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { openTranscriptionSession, sessionConfigCandidates } from "./openaiRealtime";

const options = {
  apiKey: "sk-test",
  model: "gpt-live-transcribe",
  language: "",
  dictionary: [] as ReadonlyArray<string>,
  onTranscript: () => {},
  onError: () => {},
};

/** The two shapes carry the transcription config under different keys. */
function readTranscription(config: unknown): Record<string, unknown> {
  const session = (config as { session: Record<string, unknown> }).session;
  const legacy = session["input_audio_transcription"];
  if (legacy) return legacy as Record<string, unknown>;
  const audio = session["audio"] as { input: { transcription: Record<string, unknown> } };
  return audio.input.transcription;
}

describe("transcription session config ladder", () => {
  it("offers the current shape then the legacy one when there is no dictionary", () => {
    const configs = sessionConfigCandidates(options);

    expect(configs).toHaveLength(2);
    expect((configs[0] as { type: string }).type).toBe("session.update");
    expect((configs[1] as { type: string }).type).toBe("transcription_session.update");
  });

  it("sends no prompt field at all when the dictionary is empty", () => {
    for (const config of sessionConfigCandidates(options)) {
      expect(readTranscription(config)).not.toHaveProperty("prompt");
    }
  });

  it("adds dictionary-free retries so a rejected hint cannot break dictation", () => {
    const configs = sessionConfigCandidates({
      ...options,
      dictionary: ["Vortechron", "Suamuka"],
    });

    expect(configs).toHaveLength(4);
    expect(readTranscription(configs[0])["prompt"]).toBe("Vortechron, Suamuka");
    expect(readTranscription(configs[1])["prompt"]).toBe("Vortechron, Suamuka");
    // The last resort keeps the session at the cost of the hint.
    expect(readTranscription(configs[2])).not.toHaveProperty("prompt");
    expect(readTranscription(configs[3])).not.toHaveProperty("prompt");
  });

  it("drops blank dictionary entries rather than prompting with them", () => {
    const configs = sessionConfigCandidates({ ...options, dictionary: ["  ", "Suamuka"] });

    expect(readTranscription(configs[0])["prompt"]).toBe("Suamuka");
  });

  it("treats a dictionary of only blanks as no dictionary", () => {
    expect(sessionConfigCandidates({ ...options, dictionary: ["", "   "] })).toHaveLength(2);
  });

  it("caps a long dictionary on a term boundary", () => {
    const configs = sessionConfigCandidates({
      ...options,
      dictionary: Array.from({ length: 80 }, (_, index) => `TermNumber${index}`),
    });
    const prompt = readTranscription(configs[0])["prompt"] as string;

    expect(prompt.length).toBeLessThanOrEqual(500);
    expect(prompt.endsWith(",")).toBe(false);
    expect(prompt.split(", ").every((term) => term.startsWith("TermNumber"))).toBe(true);
  });

  it("keeps the language hint alongside the dictionary in both shapes", () => {
    const configs = sessionConfigCandidates({
      ...options,
      language: "ms",
      dictionary: ["Suamuka"],
    });

    expect(readTranscription(configs[0])["languages"]).toEqual(["ms"]);
    expect(readTranscription(configs[1])["languages"]).toEqual(["ms"]);
  });

  it.each(["gpt-live-transcribe", "gpt-transcribe"])(
    "keeps all language hints in every %s configuration retry",
    (model) => {
      const configs = sessionConfigCandidates({
        ...options,
        model,
        language: " EN, ms, en ",
        dictionary: ["Suamuka"],
      });

      for (const config of configs) {
        expect(readTranscription(config)["languages"]).toEqual(["en", "ms"]);
        expect(readTranscription(config)).not.toHaveProperty("language");
      }
    },
  );

  it("omits language hints for automatic detection", () => {
    for (const config of sessionConfigCandidates({ ...options, language: " , " })) {
      expect(readTranscription(config)).not.toHaveProperty("languages");
      expect(readTranscription(config)).not.toHaveProperty("language");
    }
  });
});

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  readonly sent: Record<string, unknown>[] = [];

  constructor() {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(payload: Record<string, unknown>) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }
}

describe("finishing a transcription session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(model = "gpt-live-transcribe") {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const session = openTranscriptionSession({ ...options, model, onTranscript, onError });
    const socket = FakeWebSocket.instances[0]!;
    return { session, socket, onTranscript, onError };
  }

  it.each(["gpt-live-transcribe", "gpt-transcribe"])(
    "keeps %s open for a delayed first transcript after release",
    async (model) => {
      const { session, socket, onTranscript } = setup(model);
      socket.open();
      socket.receive({ type: "session.updated" });
      session.sendAudio(new ArrayBuffer(4_800));

      const finished = session.finish();
      socket.receive({ type: "input_audio_buffer.committed", item_id: "spoken" });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(socket.readyState).toBe(FakeWebSocket.OPEN);

      socket.receive({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "spoken",
        transcript: "Update fail ini please.",
      });
      await finished;
      expect(onTranscript).toHaveBeenLastCalledWith("Update fail ini please.");
      expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("waits for the committed item even when earlier text is already complete", async () => {
    const { session, socket, onTranscript } = setup();
    socket.open();
    socket.receive({ type: "session.updated" });
    session.sendAudio(new ArrayBuffer(4_800));
    socket.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "earlier",
      transcript: "First sentence.",
    });

    const finished = session.finish();
    socket.receive({ type: "input_audio_buffer.committed", item_id: "tail" });
    await Promise.resolve();
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);

    socket.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "tail",
      transcript: "Keep the final words.",
    });
    await finished;
    expect(onTranscript).toHaveBeenLastCalledWith("First sentence. Keep the final words.");
  });

  it("sends queued audio and commits after a delayed session acknowledgement", async () => {
    const { session, socket, onTranscript } = setup();
    session.sendAudio(new ArrayBuffer(4_800));
    const finished = session.finish();

    socket.open();
    expect(socket.sent.map((event) => event["type"])).toEqual(["session.update"]);
    socket.receive({ type: "session.created" });
    expect(socket.sent.map((event) => event["type"])).toEqual(["session.update"]);
    socket.receive({ type: "session.updated" });
    expect(socket.sent.map((event) => event["type"])).toEqual([
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);

    socket.receive({ type: "input_audio_buffer.committed", item_id: "queued" });
    socket.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "queued",
      transcript: "A short dictation.",
    });
    await finished;
    expect(onTranscript).toHaveBeenLastCalledWith("A short dictation.");
  });

  it("keeps audio queued while retrying a rejected session configuration", async () => {
    const { session, socket } = setup();
    socket.open();
    session.sendAudio(new ArrayBuffer(4_800));
    const finished = session.finish();
    socket.receive({ type: "error", error: { message: "Unrecognized session config." } });
    expect(socket.sent.map((event) => event["type"])).toEqual([
      "session.update",
      "transcription_session.update",
    ]);

    socket.receive({ type: "transcription_session.updated" });
    expect(socket.sent.map((event) => event["type"])).toEqual([
      "session.update",
      "transcription_session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
    session.close();
    await finished;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes immediately without committing when no audio was captured", async () => {
    const { session, socket } = setup();
    socket.open();
    socket.receive({ type: "session.updated" });
    await session.finish();

    expect(socket.sent.map((event) => event["type"])).toEqual(["session.update"]);
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a timeout and keeps partial text instead of silently finishing", async () => {
    const { session, socket, onTranscript, onError } = setup();
    socket.open();
    socket.receive({ type: "session.updated" });
    session.sendAudio(new ArrayBuffer(4_800));
    socket.receive({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "partial",
      delta: "Keep these words",
    });
    const finished = session.finish();
    socket.receive({ type: "input_audio_buffer.committed", item_id: "partial" });

    await vi.advanceTimersByTimeAsync(30_000);
    await finished;
    expect(onError).toHaveBeenCalledWith(
      "OpenAI took too long to finish dictation. Any text received has been kept. Try again.",
    );
    expect(onTranscript).toHaveBeenLastCalledWith("Keep these words");
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles a cancelled finish and ignores late text", async () => {
    const { session, socket, onTranscript } = setup();
    socket.open();
    socket.receive({ type: "session.updated" });
    session.sendAudio(new ArrayBuffer(4_800));
    const finished = session.finish();
    session.close();
    await finished;

    socket.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "cancelled",
      transcript: "Do not insert this.",
    });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles immediately when transcription fails", async () => {
    const { session, socket, onError } = setup();
    socket.open();
    socket.receive({ type: "session.updated" });
    session.sendAudio(new ArrayBuffer(4_800));
    const finished = session.finish();
    socket.receive({
      type: "conversation.item.input_audio_transcription.failed",
      item_id: "failed",
      error: { message: "Transcription failed." },
    });
    await finished;

    expect(onError).toHaveBeenCalledWith("Transcription failed.");
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a dropped connection and releases the final wait", async () => {
    const { session, socket, onError } = setup();
    socket.open();
    socket.receive({ type: "session.updated" });
    session.sendAudio(new ArrayBuffer(4_800));
    const finished = session.finish();
    socket.close();
    await finished;

    expect(onError).toHaveBeenCalledWith("The OpenAI connection closed before dictation finished.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("commits only once when finish is called again", async () => {
    const { session, socket } = setup();
    socket.open();
    socket.receive({ type: "session.updated" });
    session.sendAudio(new ArrayBuffer(4_800));
    const finished = session.finish();
    expect(session.finish()).toBe(finished);
    expect(
      socket.sent.filter((event) => event["type"] === "input_audio_buffer.commit"),
    ).toHaveLength(1);
    session.close();
    await finished;
  });
});
