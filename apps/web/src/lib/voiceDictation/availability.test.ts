import { describe, expect, it } from "vite-plus/test";

import { resolveVoiceDictationAvailability } from "./availability";

const ready = {
  enabled: true,
  apiKey: "sk-test",
  isSecureContext: true,
  canCaptureAudio: true,
} as const;

describe("resolveVoiceDictationAvailability", () => {
  it("is available once the setting is on and a key exists", () => {
    expect(resolveVoiceDictationAvailability(ready)).toEqual({
      available: true,
      blockedReason: null,
      message: null,
    });
  });

  it("blocks while the setting is off", () => {
    const result = resolveVoiceDictationAvailability({ ...ready, enabled: false });

    expect(result.available).toBe(false);
    expect(result.blockedReason).toBe("disabled");
  });

  it("treats a whitespace-only key as missing", () => {
    const result = resolveVoiceDictationAvailability({ ...ready, apiKey: "   " });

    expect(result.blockedReason).toBe("missing-api-key");
    expect(result.message).toBe("Add an OpenAI API key in Settings → General");
  });

  it("names the connection when the page is not a secure context", () => {
    const result = resolveVoiceDictationAvailability({ ...ready, isSecureContext: false });

    expect(result.blockedReason).toBe("insecure-context");
  });

  it("reports an unsupported browser ahead of an insecure context", () => {
    const result = resolveVoiceDictationAvailability({
      ...ready,
      canCaptureAudio: false,
      isSecureContext: false,
    });

    expect(result.blockedReason).toBe("unsupported-browser");
  });

  it("reports the missing key before anything the browser cannot do", () => {
    const result = resolveVoiceDictationAvailability({
      ...ready,
      apiKey: "",
      canCaptureAudio: false,
    });

    expect(result.blockedReason).toBe("missing-api-key");
  });
});
