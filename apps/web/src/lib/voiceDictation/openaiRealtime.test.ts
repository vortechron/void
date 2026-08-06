import { describe, expect, it } from "vite-plus/test";

import { sessionConfigCandidates } from "./openaiRealtime";

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
    expect(readTranscription(configs[1])["language"]).toBe("ms");
  });
});
