import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";
import {
  ClientSettingsSchema,
  ClientSettingsPatch,
  ClaudeSettings,
  DEFAULT_SERVER_SETTINGS,
  defaultEnabledForDriver,
  resolveProviderInstanceEnabled,
  ServerSettings,
  ServerSettingsPatch,
} from "./settings.ts";

const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodeClientSettingsPatch = Schema.decodeUnknownSync(ClientSettingsPatch);
const encodeClientSettings = Schema.encodeSync(ClientSettingsSchema);
const decodeServerSettings = Schema.decodeUnknownSync(ServerSettings);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);
const encodeServerSettings = Schema.encodeSync(ServerSettings);
const decodeClaudeSettings = Schema.decodeUnknownSync(ClaudeSettings);

describe("ClaudeSettings auto-compaction", () => {
  it("uses Claude's default threshold when no override is configured", () => {
    expect(decodeClaudeSettings({}).autoCompactWindow).toBe("");
  });

  it.each(["100000", "300000", "1000000"])(
    "accepts a supported auto-compaction threshold: %s",
    (value) => {
      expect(decodeClaudeSettings({ autoCompactWindow: value }).autoCompactWindow).toBe(value);
    },
  );

  it.each(["99999", "1000001", "300k", "invalid"])(
    "rejects an unsupported auto-compaction threshold: %s",
    (value) => {
      expect(() => decodeClaudeSettings({ autoCompactWindow: value })).toThrow();
    },
  );

  it("rejects an unsupported threshold at the settings patch boundary", () => {
    expect(() =>
      decodeServerSettingsPatch({ providers: { claudeAgent: { autoCompactWindow: "300k" } } }),
    ).toThrow();
    expect(
      decodeServerSettingsPatch({ providers: { claudeAgent: { autoCompactWindow: "300000" } } }),
    ).toBeDefined();
  });
});

describe("ClientSettings agent completion alerts", () => {
  it("defaults notifications off and the completion sound to chime", () => {
    const settings = decodeClientSettings({});

    expect(settings.agentNotificationsEnabled).toBe(false);
    expect(settings.completionSound).toBe("chime");
  });

  it.each(["none", "chime"] as const)("accepts the completion sound %s", (value) => {
    expect(decodeClientSettingsPatch({ completionSound: value }).completionSound).toBe(value);
  });

  it("rejects unsupported completion sounds", () => {
    expect(() => decodeClientSettings({ completionSound: "alarm" })).toThrow();
    expect(() => decodeClientSettingsPatch({ completionSound: "alarm" })).toThrow();
  });
});

describe("ClientSettings word wrap", () => {
  it("defaults word wrap on", () => {
    expect(decodeClientSettings({}).wordWrap).toBe(true);
  });

  it("ignores obsolete wrapping preferences", () => {
    const decoded = decodeClientSettings({
      chatWordWrap: false,
      diffWordWrap: false,
    });

    expect(decoded.wordWrap).toBe(true);
    expect(decoded).not.toHaveProperty("chatWordWrap");
    expect(decoded).not.toHaveProperty("diffWordWrap");
  });
});

describe("ClientSettings quit confirmation", () => {
  it("defaults to hold", () => {
    expect(decodeClientSettings({}).confirmQuit).toBe("hold");
  });

  it.each(["direct", "hold", "double-click"] as const)("accepts the %s mode", (mode) => {
    expect(decodeClientSettings({ confirmQuit: mode }).confirmQuit).toBe(mode);
    expect(decodeClientSettingsPatch({ confirmQuit: mode }).confirmQuit).toBe(mode);
  });

  it.each([
    [true, "hold"],
    [false, "direct"],
  ] as const)("migrates the legacy %s value to %s", (legacyValue, mode) => {
    const settings = decodeClientSettings({ confirmQuit: legacyValue });

    expect(settings.confirmQuit).toBe(mode);
    expect(encodeClientSettings(settings).confirmQuit).toBe(mode);
  });

  it("rejects legacy booleans at the patch boundary", () => {
    expect(() => decodeClientSettingsPatch({ confirmQuit: true })).toThrow();
  });
});

describe("ClientSettings browser recording frame rate", () => {
  it("defaults to 30 fps", () => {
    expect(decodeClientSettings({}).browserRecordingFrameRate).toBe(30);
  });

  it.each([30, 60])("accepts a supported frame rate: %s", (frameRate) => {
    expect(
      decodeClientSettings({ browserRecordingFrameRate: frameRate }).browserRecordingFrameRate,
    ).toBe(frameRate);
    expect(
      decodeClientSettingsPatch({ browserRecordingFrameRate: frameRate }).browserRecordingFrameRate,
    ).toBe(frameRate);
  });

  it.each([24, 59, 120])("rejects an unsupported frame rate: %s", (frameRate) => {
    expect(() => decodeClientSettings({ browserRecordingFrameRate: frameRate })).toThrow();
    expect(() => decodeClientSettingsPatch({ browserRecordingFrameRate: frameRate })).toThrow();
  });
});

describe("ClientSettings glass opacity", () => {
  it("defaults to a readable translucent surface", () => {
    expect(decodeClientSettings({}).glassOpacity).toBe(80);
  });

  it.each([39, 101, 72.5])("rejects an invalid glass opacity: %s", (value) => {
    expect(() => decodeClientSettings({ glassOpacity: value })).toThrow();
    expect(() => decodeClientSettingsPatch({ glassOpacity: value })).toThrow();
  });

  it.each([40, 75, 100])("accepts a glass opacity within the supported range: %s", (value) => {
    expect(decodeClientSettings({ glassOpacity: value }).glassOpacity).toBe(value);
    expect(decodeClientSettingsPatch({ glassOpacity: value }).glassOpacity).toBe(value);
  });
});

describe("ClientSettings appearance preferences", () => {
  it("defaults legacy configs to the current fonts, sizes, and automatic code theme", () => {
    const settings = decodeClientSettings({});

    expect(settings.uiFontFamily).toBe("dm-sans");
    expect(settings.uiFontSize).toBe(16);
    expect(settings.codeFontFamily).toBe("system-mono");
    expect(settings.codeFontSize).toBe(13);
    expect(settings.codeTheme).toBe("default");
  });

  it.each(["dm-sans", "system", "serif", "Comic Sans MS"])(
    "accepts the UI font family %s",
    (value) => {
      expect(decodeClientSettingsPatch({ uiFontFamily: value }).uiFontFamily).toBe(value);
    },
  );

  it("trims an installed UI font family before storing it", () => {
    expect(
      decodeClientSettingsPatch({ uiFontFamily: "  Atkinson Hyperlegible  " }).uiFontFamily,
    ).toBe("Atkinson Hyperlegible");
  });

  it.each(["system-mono", "jetbrains-mono", "monospace", "Berkeley Mono"])(
    "accepts the code font family %s",
    (value) => {
      expect(decodeClientSettingsPatch({ codeFontFamily: value }).codeFontFamily).toBe(value);
    },
  );

  it.each([
    ["uiFontFamily", ""],
    ["uiFontFamily", " ".repeat(3)],
    ["codeFontFamily", "a".repeat(257)],
  ] as const)("rejects an invalid %s", (key, value) => {
    expect(() => decodeClientSettingsPatch({ [key]: value })).toThrow();
  });

  it.each([
    "default",
    "catppuccin-latte",
    "catppuccin-macchiato",
    "catppuccin-mocha",
    "dracula",
    "nord",
    "tokyo-night",
    "gruvbox-dark",
    "solarized-dark",
  ])("accepts the code theme %s", (value) => {
    expect(decodeClientSettingsPatch({ codeTheme: value }).codeTheme).toBe(value);
  });

  it.each([
    ["uiFontSize", 11],
    ["uiFontSize", 21],
    ["codeFontSize", 9],
    ["codeFontSize", 21],
  ] as const)("rejects %s outside its supported range", (key, value) => {
    expect(() => decodeClientSettingsPatch({ [key]: value })).toThrow();
  });

  it("rejects an unsupported code theme", () => {
    expect(() => decodeClientSettingsPatch({ codeTheme: "unknown" })).toThrow();
  });
});

describe("ClientSettings appearance contrast", () => {
  it("defaults to standard contrast", () => {
    expect(decodeClientSettings({}).appearanceContrast).toBe(100);
  });

  it.each([49, 201, 92.5])("rejects an invalid appearance contrast: %s", (value) => {
    expect(() => decodeClientSettings({ appearanceContrast: value })).toThrow();
    expect(() => decodeClientSettingsPatch({ appearanceContrast: value })).toThrow();
  });

  it.each([50, 100, 150, 200])(
    "accepts appearance contrast within the supported range: %s",
    (value) => {
      expect(decodeClientSettings({ appearanceContrast: value }).appearanceContrast).toBe(value);
      expect(decodeClientSettingsPatch({ appearanceContrast: value }).appearanceContrast).toBe(
        value,
      );
    },
  );
});

describe("ClientSettings panel animations", () => {
  it("defaults to instant changes", () => {
    expect(decodeClientSettings({}).panelAnimationDurationMs).toBe(0);
  });

  it.each([0, 400])("accepts a panel animation duration: %s", (value) => {
    expect(decodeClientSettingsPatch({ panelAnimationDurationMs: value })).toEqual({
      panelAnimationDurationMs: value,
    });
  });

  it.each([-1, 401, 150.5])("rejects an invalid panel animation duration: %s", (value) => {
    expect(() => decodeClientSettingsPatch({ panelAnimationDurationMs: value })).toThrow();
  });
});

describe("ClientSettings environment identification", () => {
  it("defaults to artwork and accepts each presentation mode", () => {
    expect(decodeClientSettings({}).environmentIdentificationMode).toBe("artwork");

    for (const mode of ["artwork", "pill", "none"] as const) {
      expect(
        decodeClientSettingsPatch({ environmentIdentificationMode: mode })
          .environmentIdentificationMode,
      ).toBe(mode);
    }
  });

  it("rejects unsupported presentation modes", () => {
    expect(() => decodeClientSettings({ environmentIdentificationMode: "badge" })).toThrow();
    expect(() => decodeClientSettingsPatch({ environmentIdentificationMode: "badge" })).toThrow();
  });
});

describe("ClientSettings sidebar", () => {
  it("defaults to Void's custom sidebar", () => {
    const settings = decodeClientSettings({});
    expect(settings.sidebarV2Enabled).toBe(false);
    expect(settings.sidebarProjectGroups).toEqual([]);
    expect(settings.sidebarActiveProjectGroupId).toBeNull();
  });

  it("preserves an explicit sidebar v2 beta opt-in", () => {
    expect(decodeClientSettings({ sidebarV2Enabled: true }).sidebarV2Enabled).toBe(true);
    expect(decodeClientSettingsPatch({ sidebarV2Enabled: true }).sidebarV2Enabled).toBe(true);
  });

  it("shows real project names until private project names are turned on", () => {
    expect(decodeClientSettings({}).privateProjectNames).toBe(false);
    expect(decodeClientSettings({ privateProjectNames: true }).privateProjectNames).toBe(true);
    expect(decodeClientSettingsPatch({ privateProjectNames: true }).privateProjectNames).toBe(true);
  });

  it("shows skills in the slash menu by default and allows hiding them", () => {
    expect(decodeClientSettings({}).showSkillsInSlashMenu).toBe(true);
    expect(decodeClientSettingsPatch({ showSkillsInSlashMenu: false }).showSkillsInSlashMenu).toBe(
      false,
    );
  });

  it("keeps unpin confirmation opt-in and patchable", () => {
    expect(decodeClientSettings({}).confirmThreadUnpin).toBe(false);
    expect(decodeClientSettingsPatch({ confirmThreadUnpin: true }).confirmThreadUnpin).toBe(true);
    expect(() => decodeClientSettingsPatch({ confirmThreadUnpin: "yes" })).toThrow();
  });
});

describe("ClientSettings context window meter", () => {
  it("defaults off and preserves an explicit legacy opt-in", () => {
    expect(decodeClientSettings({}).contextWindowMeterEnabled).toBe(false);
    expect(
      decodeClientSettings({ contextWindowMeterEnabled: true }).contextWindowMeterEnabled,
    ).toBe(true);
    expect(
      decodeClientSettingsPatch({ contextWindowMeterEnabled: true }).contextWindowMeterEnabled,
    ).toBe(true);
  });
});

describe("ServerSettings thread settlement", () => {
  it("defaults merge settlement on and inactivity settlement to three days", () => {
    const settings = decodeServerSettings({});
    expect(settings.sidebarAutoSettleAfterDays).toBe(3);
    expect(settings.sidebarAutoSettleOnMerge).toBe(true);
  });

  it("allows both automatic rules to be disabled", () => {
    expect(
      decodeServerSettings({
        sidebarAutoSettleAfterDays: null,
        sidebarAutoSettleOnMerge: false,
      }),
    ).toMatchObject({ sidebarAutoSettleAfterDays: null, sidebarAutoSettleOnMerge: false });
    expect(
      decodeServerSettingsPatch({
        sidebarAutoSettleAfterDays: null,
        sidebarAutoSettleOnMerge: false,
      }),
    ).toMatchObject({ sidebarAutoSettleAfterDays: null, sidebarAutoSettleOnMerge: false });
  });

  it.each([-1, 0, 91])("rejects an auto-settle threshold outside 1..90: %s", (value) => {
    expect(() => decodeServerSettings({ sidebarAutoSettleAfterDays: value })).toThrow();
    expect(() => decodeServerSettingsPatch({ sidebarAutoSettleAfterDays: value })).toThrow();
  });

  it("accepts saved project groups and fills in an omitted member list", () => {
    const patch = decodeClientSettingsPatch({
      sidebarProjectGroups: [
        { id: "group-work", name: " Work ", projectKeys: ["project-a"] },
        { id: "group-empty", name: "Empty" },
      ],
      sidebarActiveProjectGroupId: "group-work",
    });

    expect(patch.sidebarProjectGroups).toEqual([
      { id: "group-work", name: "Work", projectKeys: ["project-a"] },
      { id: "group-empty", name: "Empty", projectKeys: [] },
    ]);
    expect(patch.sidebarActiveProjectGroupId).toBe("group-work");
  });

  it("rejects a project group with a blank id or name", () => {
    expect(() =>
      decodeClientSettingsPatch({
        sidebarProjectGroups: [{ id: " ", name: "Work", projectKeys: [] }],
      }),
    ).toThrow();
    expect(() =>
      decodeClientSettingsPatch({
        sidebarProjectGroups: [{ id: "group-work", name: " ", projectKeys: [] }],
      }),
    ).toThrow();
  });
});

describe("ClientSettings voice dictation", () => {
  it("defaults the whole block for a settings file that has never seen it", () => {
    const voiceDictation = decodeClientSettings({}).voiceDictation;

    expect(voiceDictation.enabled).toBe(false);
    expect(voiceDictation.openaiApiKey).toBe("");
    expect(voiceDictation.model).toBe("gpt-live-transcribe");
    expect(voiceDictation.language).toBe("");
    expect(voiceDictation.style).toBe("cleanup");
    expect(voiceDictation.styleInstructions).toBe("");
    expect(voiceDictation.polishModel).toBe("gpt-4.1-mini");
    expect(voiceDictation.dictionary).toEqual([]);
    expect(voiceDictation.snippets).toEqual([]);
    expect(voiceDictation.soundCues).toBe(true);
  });

  it("fills the cleanup fields in for a blob written before they existed", () => {
    // The shape every user who enabled dictation already has on disk.
    const voiceDictation = decodeClientSettings({
      voiceDictation: {
        enabled: true,
        openaiApiKey: "sk-test",
        model: "gpt-transcribe",
        language: "ms",
      },
    }).voiceDictation;

    expect(voiceDictation.enabled).toBe(true);
    expect(voiceDictation.model).toBe("gpt-transcribe");
    expect(voiceDictation.style).toBe("cleanup");
    expect(voiceDictation.dictionary).toEqual([]);
    expect(voiceDictation.snippets).toEqual([]);
    // Sound is on for a user who enabled dictation before the cues existed:
    // they are the ones who have been holding a button with no feedback.
    expect(voiceDictation.soundCues).toBe(true);
  });

  it.each(["off", "cleanup", "rewrite"] as const)("accepts the style %s", (style) => {
    expect(decodeClientSettings({ voiceDictation: { style } }).voiceDictation.style).toBe(style);
    expect(decodeClientSettingsPatch({ voiceDictation: { style } }).voiceDictation?.style).toBe(
      style,
    );
  });

  it("rejects a style this build does not know", () => {
    expect(() => decodeClientSettings({ voiceDictation: { style: "formal" } })).toThrow();
    expect(() => decodeClientSettingsPatch({ voiceDictation: { style: "formal" } })).toThrow();
  });

  it("carries dictionary terms and snippets through the patch the panel writes", () => {
    const patch = decodeClientSettingsPatch({
      voiceDictation: {
        dictionary: ["Vortechron", "Suamuka"],
        snippets: [{ id: "my-email", trigger: "my email", replacement: "hi@example.com" }],
      },
    });

    expect(patch.voiceDictation?.dictionary).toEqual(["Vortechron", "Suamuka"]);
    expect(patch.voiceDictation?.snippets).toEqual([
      { id: "my-email", trigger: "my email", replacement: "hi@example.com" },
    ]);
  });

  it("rejects a snippet with a blank trigger or replacement", () => {
    for (const snippet of [
      { id: "a", trigger: "   ", replacement: "hi@example.com" },
      { id: "a", trigger: "my email", replacement: "" },
    ]) {
      expect(() => decodeClientSettings({ voiceDictation: { snippets: [snippet] } })).toThrow();
    }
  });
});

describe("ServerSettings.providerInstances (slice-2 invariant)", () => {
  it("defaults text generation to Luna at low reasoning effort", () => {
    expect(DEFAULT_SERVER_SETTINGS.textGenerationModelSelection).toEqual({
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-luna",
      options: [{ id: "reasoningEffort", value: "low" }],
    });
  });

  it("defaults to an empty record so legacy configs without the key still decode", () => {
    expect(DEFAULT_SERVER_SETTINGS.providerInstances).toEqual({});
  });

  it("decodes a fully empty config (legacy on-disk shape) without complaint", () => {
    const decoded = decodeServerSettings({});
    expect(decoded.providerInstances).toEqual({});
    // Legacy `providers` struct is still hydrated with its per-driver defaults
    // so existing call sites keep working through the migration.
    expect(decoded.providers.codex.enabled).toBe(true);
  });

  it("decodes a multi-instance map mixing first-party and fork drivers", () => {
    const decoded = decodeServerSettings({
      providerInstances: {
        codex_personal: {
          driver: "codex",
          displayName: "Codex (personal)",
          config: { homePath: "~/.codex_personal" },
        },
        codex_work: {
          driver: "codex",
          config: { homePath: "~/.codex_work" },
        },
        ollama_local: {
          driver: "ollama",
          displayName: "Ollama (local)",
          config: { endpoint: "http://localhost:11434" },
        },
      },
    });
    const personalId = ProviderInstanceId.make("codex_personal");
    const workId = ProviderInstanceId.make("codex_work");
    const ollamaId = ProviderInstanceId.make("ollama_local");

    expect(decoded.providerInstances[personalId]?.driver).toBe("codex");
    expect(decoded.providerInstances[workId]?.config).toEqual({ homePath: "~/.codex_work" });
    // Critical: a config naming a driver this build does not know about
    // (`ollama` is not in `ProviderDriverKind`) must round-trip without loss.
    // The runtime handles "driver not installed" — the schema must not.
    expect(decoded.providerInstances[ollamaId]?.driver).toBe("ollama");
    expect(decoded.providerInstances[ollamaId]?.config).toEqual({
      endpoint: "http://localhost:11434",
    });
  });

  it("rejects instance keys that violate the slug pattern", () => {
    expect(() =>
      decodeServerSettings({
        providerInstances: { "1bad": { driver: "codex" } },
      }),
    ).toThrow();
  });
});

describe("provider enabled defaults", () => {
  it("enables only the stable bindings by default", () => {
    const decoded = decodeServerSettings({});
    expect(decoded.providers.codex.enabled).toBe(true);
    expect(decoded.providers.claudeAgent.enabled).toBe(true);
    expect(decoded.providers.cursor.enabled).toBe(false);
    expect(decoded.providers.grok.enabled).toBe(false);
    expect(decoded.providers.opencode.enabled).toBe(false);
  });

  it("derives per-driver defaults from the settings schemas", () => {
    expect(defaultEnabledForDriver(ProviderDriverKind.make("codex"))).toBe(true);
    expect(defaultEnabledForDriver(ProviderDriverKind.make("cursor"))).toBe(false);
    expect(defaultEnabledForDriver(ProviderDriverKind.make("grok"))).toBe(false);
    // Unknown fork drivers stay enabled; their own build decides otherwise.
    expect(defaultEnabledForDriver(ProviderDriverKind.make("ollama"))).toBe(true);
  });

  it("keeps Cursor enabled when an existing user explicitly opted in", () => {
    const cursor = ProviderDriverKind.make("cursor");
    const cursorId = ProviderInstanceId.make("cursor");
    const decoded = decodeServerSettings({
      providers: { cursor: { enabled: true } },
      providerInstances: {
        [cursorId]: { driver: cursor, enabled: true, config: {} },
      },
    });

    expect(decoded.providers.cursor.enabled).toBe(true);
    expect(resolveProviderInstanceEnabled(decoded.providerInstances[cursorId]!)).toBe(true);
  });

  it("resolves instance enabled state with explicit false winning", () => {
    const grok = ProviderDriverKind.make("grok");
    const codex = ProviderDriverKind.make("codex");
    // No flags anywhere: driver default applies.
    expect(resolveProviderInstanceEnabled({ driver: grok, config: {} })).toBe(false);
    expect(resolveProviderInstanceEnabled({ driver: codex, config: {} })).toBe(true);
    // Envelope flag wins over the driver default.
    expect(resolveProviderInstanceEnabled({ driver: grok, enabled: true, config: {} })).toBe(true);
    expect(resolveProviderInstanceEnabled({ driver: codex, enabled: false, config: {} })).toBe(
      false,
    );
    // Legacy in-config flag fills in when the envelope is silent.
    expect(resolveProviderInstanceEnabled({ driver: grok, config: { enabled: true } })).toBe(true);
    // Conflicting flags: the explicit false wins, whichever side it is on.
    expect(
      resolveProviderInstanceEnabled({ driver: grok, enabled: true, config: { enabled: false } }),
    ).toBe(false);
    expect(
      resolveProviderInstanceEnabled({ driver: codex, enabled: false, config: { enabled: true } }),
    ).toBe(false);
  });
});

describe("ServerSettings worktree defaults", () => {
  it("defaults start-from-origin on for legacy configs", () => {
    expect(decodeServerSettings({}).newWorktreesStartFromOrigin).toBe(true);
  });

  it("accepts start-from-origin updates", () => {
    expect(
      decodeServerSettingsPatch({ newWorktreesStartFromOrigin: false }).newWorktreesStartFromOrigin,
    ).toBe(false);
  });
});

describe("ServerSettings.sourceControlWritingStyle", () => {
  it("defaults all style settings for legacy configs", () => {
    const settings = decodeServerSettings({});

    expect(settings.sourceControlWritingStyle).toEqual({
      mode: "repo_conventions",
      customInstructions: "",
      followChangeRequestTemplates: true,
    });
    expect(settings.sourceControlWriterModelSelection).toBeNull();
  });

  it("trims partial style updates", () => {
    const patch = decodeServerSettingsPatch({
      sourceControlWritingStyle: {
        mode: "custom",
        customInstructions: "  Prefer concise wording.  ",
      },
    });

    expect(patch.sourceControlWritingStyle).toEqual({
      mode: "custom",
      customInstructions: "Prefer concise wording.",
    });
  });
});

describe("ServerSettingsPatch.providerInstances", () => {
  it("treats providerInstances as an optional whole-map replacement", () => {
    const patch = decodeServerSettingsPatch({});
    expect(patch.providerInstances).toBeUndefined();

    const replacement = decodeServerSettingsPatch({
      providerInstances: {
        codex_personal: { driver: "codex", config: { homePath: "~/.codex" } },
      },
    });
    expect(replacement.providerInstances).toBeDefined();
    expect(replacement.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.driver).toBe(
      "codex",
    );
  });

  it("preserves a fork-defined driver entry through patch decoding", () => {
    const patch = decodeServerSettingsPatch({
      providerInstances: {
        ollama_local: {
          driver: "ollama",
          config: { endpoint: "http://localhost:11434" },
        },
      },
    });
    const ollamaId = ProviderInstanceId.make("ollama_local");
    expect(patch.providerInstances?.[ollamaId]?.driver).toBe("ollama");
  });
});

describe("ServerSettingsPatch string normalization", () => {
  it("trims string settings while decoding patches", () => {
    const patch = decodeServerSettingsPatch({
      addProjectBaseDirectory: "  ~/Development  ",
      textGenerationModelSelection: { model: "  gpt-5.4-mini  " },
      observability: {
        otlpTracesUrl: "  http://localhost:4318/v1/traces  ",
      },
      providers: {
        codex: {
          binaryPath: "  /opt/homebrew/bin/codex  ",
          homePath: "  ~/.codex  ",
          launchArgs: "  --strict-config --enable foo  ",
        },
      },
      providerInstances: {
        codex_personal: {
          driver: "  codex  ",
          displayName: "  Codex Personal  ",
          config: { homePath: "  ~/.codex-personal  " },
        },
      },
    });

    expect(patch.addProjectBaseDirectory).toBe("~/Development");
    expect(patch.textGenerationModelSelection?.model).toBe("gpt-5.4-mini");
    expect(patch.observability?.otlpTracesUrl).toBe("http://localhost:4318/v1/traces");
    expect(patch.providers?.codex?.binaryPath).toBe("/opt/homebrew/bin/codex");
    expect(patch.providers?.codex?.homePath).toBe("~/.codex");
    expect(patch.providers?.codex?.launchArgs).toBe("--strict-config --enable foo");
    expect(patch.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.driver).toBe(
      "codex",
    );
    expect(patch.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.displayName).toBe(
      "Codex Personal",
    );
    expect(patch.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.config).toEqual({
      homePath: "  ~/.codex-personal  ",
    });
  });

  it("trims encoded server settings values before validation", () => {
    const defaultSettings = decodeServerSettings({});
    const encoded = encodeServerSettings({
      ...defaultSettings,
      addProjectBaseDirectory: "  ~/Development  ",
      providers: {
        ...defaultSettings.providers,
        codex: {
          ...defaultSettings.providers.codex,
          binaryPath: "  /opt/homebrew/bin/codex  ",
          launchArgs: "  --strict-config  ",
        },
      },
    });

    expect(encoded.addProjectBaseDirectory).toBe("~/Development");
    expect(encoded.providers?.codex?.binaryPath).toBe("/opt/homebrew/bin/codex");
    expect(encoded.providers?.codex?.launchArgs).toBe("--strict-config");
  });
});

describe("ClientSettings chat ambient effects", () => {
  it("defaults both effects off", () => {
    const settings = decodeClientSettings({});

    expect(settings.chatBackgroundEffect).toBe("none");
    expect(settings.chatBorderEffect).toBe("none");
  });

  it("keeps the background and the border independent", () => {
    const settings = decodeClientSettings({
      chatBackgroundEffect: "meteors",
      chatBorderEffect: "ripple",
    });

    expect(settings.chatBackgroundEffect).toBe("meteors");
    expect(settings.chatBorderEffect).toBe("ripple");
  });

  it("reads a value it does not recognise as the default", () => {
    // `ripple` was a background value before the split, so a settings file
    // written by an older build still says this.
    expect(decodeClientSettings({ chatBackgroundEffect: "ripple" }).chatBackgroundEffect).toBe(
      "none",
    );
    expect(decodeClientSettings({ chatBorderEffect: "meteors" }).chatBorderEffect).toBe("none");
  });

  it("still rejects an unrecognised value in a patch", () => {
    expect(() => decodeClientSettingsPatch({ chatBackgroundEffect: "ripple" })).toThrow();
    expect(() => decodeClientSettingsPatch({ chatBorderEffect: "meteors" })).toThrow();
  });
});

describe("ServerSettings global actions", () => {
  const globalScript = {
    id: "install",
    name: "Install",
    command: "pnpm install",
    icon: "configure" as const,
    runOnWorktreeCreate: true,
  };
  const globalPromptAction = {
    id: "review",
    name: "Review",
    icon: "test" as const,
    prompt: "Review the diff.",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
  };

  it("defaults both lists to empty for a settings file that predates them", () => {
    const settings = decodeServerSettings({});

    expect(settings.globalScripts).toEqual([]);
    expect(settings.globalPromptActions).toEqual([]);
  });

  it("round-trips both lists", () => {
    const settings = decodeServerSettings({
      globalScripts: [globalScript],
      globalPromptActions: [globalPromptAction],
    });

    expect(settings.globalScripts).toEqual([globalScript]);
    expect(settings.globalPromptActions[0]?.id).toBe("review");
    expect(encodeServerSettings(settings).globalScripts).toEqual([globalScript]);
  });

  it("accepts both lists in a patch", () => {
    const patch = decodeServerSettingsPatch({
      globalScripts: [globalScript],
      globalPromptActions: [globalPromptAction],
    });

    expect(patch.globalScripts).toEqual([globalScript]);
    expect(patch.globalPromptActions).toHaveLength(1);
  });

  it("omits the keys from a patch that does not mention them", () => {
    const patch = decodeServerSettingsPatch({ enableLegacyTokenStreaming: true });

    expect(patch.globalScripts).toBeUndefined();
    expect(patch.globalPromptActions).toBeUndefined();
  });
});

describe("ClientSettings workspace state", () => {
  it("defaults to nothing open and nothing labelled", () => {
    const settings = decodeClientSettings({});

    expect(settings.workspaceThreadTabs).toEqual({ version: 0, byWorkspaceKey: {} });
    expect(settings.workspaceSidebar).toEqual({
      version: 0,
      namesByWorkspaceKey: {},
      pinnedWorkspaceKeys: [],
      archivedWorkspaceKeys: [],
    });
  });

  it("keeps open chats in tab order, per workspace", () => {
    const decoded = decodeClientSettings({
      workspaceThreadTabs: {
        version: 3,
        byWorkspaceKey: {
          "env-1:project-1": [
            { environmentId: "env-1", threadId: "thread-b" },
            { environmentId: "env-1", threadId: "thread-a" },
          ],
        },
      },
    });

    expect(decoded.workspaceThreadTabs.version).toBe(3);
    expect(
      decoded.workspaceThreadTabs.byWorkspaceKey["env-1:project-1"]?.map((tab) => tab.threadId),
    ).toEqual(["thread-b", "thread-a"]);
  });

  it("rejects a tab with no thread behind it", () => {
    expect(() =>
      decodeClientSettingsPatch({
        workspaceThreadTabs: {
          version: 1,
          byWorkspaceKey: { "env-1:project-1": [{ environmentId: "env-1", threadId: "" }] },
        },
      }),
    ).toThrow();
  });

  it("accepts patches for both workspace slices", () => {
    const patch = decodeClientSettingsPatch({
      workspaceThreadTabs: {
        version: 2,
        byWorkspaceKey: { w: [{ environmentId: "env-1", threadId: "thread-a" }] },
      },
      workspaceSidebar: {
        version: 2,
        namesByWorkspaceKey: { w: "Review queue" },
        pinnedWorkspaceKeys: ["w"],
        archivedWorkspaceKeys: [],
      },
    });

    expect(patch.workspaceThreadTabs?.byWorkspaceKey.w?.[0]?.threadId).toBe("thread-a");
    expect(patch.workspaceSidebar?.pinnedWorkspaceKeys).toEqual(["w"]);
  });

  it("fills in the sidebar slices a partial value omits", () => {
    expect(
      decodeClientSettings({ workspaceSidebar: { pinnedWorkspaceKeys: ["w"] } }),
    ).toMatchObject({
      workspaceSidebar: {
        namesByWorkspaceKey: {},
        pinnedWorkspaceKeys: ["w"],
        archivedWorkspaceKeys: [],
      },
    });
  });
});
