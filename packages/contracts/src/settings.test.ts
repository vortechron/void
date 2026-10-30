import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { type CommandId, ProjectId } from "./baseSchemas.ts";
import {
  ProviderDriverKind,
  ProviderInstanceEnvironment,
  ProviderInstanceId,
} from "./providerInstance.ts";
import {
  ClientSettingsSchema,
  ClientSettingsPatch,
  ClaudeSettings,
  DEFAULT_SERVER_SETTINGS,
  globalIdleCompaction,
  idleCompactionPatch,
  requiredScopesForProjectMutation,
  resolveIdleCompaction,
  resolveProjectProviderInstanceEnabled,
  resolveProviderInstanceEnabled,
  ServerSettings,
  ServerSettingsPatch,
  withIdleCompaction,
} from "./settings.ts";

const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodeClientSettingsPatch = Schema.decodeUnknownSync(ClientSettingsPatch);
const encodeClientSettings = Schema.encodeSync(ClientSettingsSchema);
const decodeServerSettings = Schema.decodeUnknownSync(ServerSettings);
const encodeProviderInstanceEnvironment = Schema.encodeSync(ProviderInstanceEnvironment);
const decodeProviderInstanceEnvironment = Schema.decodeSync(ProviderInstanceEnvironment);
// The environment variable shape builds released before secret references decode.
const decodeStringOnlyEnvironment = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({ name: Schema.String, value: Schema.String, sensitive: Schema.Boolean }),
  ),
);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);
const encodeServerSettings = Schema.encodeSync(ServerSettings);
const encodeServerSettingsPatch = Schema.encodeSync(ServerSettingsPatch);
const decodeClaudeSettings = Schema.decodeUnknownSync(ClaudeSettings);

describe("storage cleanup settings", () => {
  it("keeps cleanup disabled for existing installations", () => {
    expect(decodeServerSettings({}).worktreeCleanup).toBeNull();
    expect(decodeServerSettings({}).storageCleanup).toEqual({
      worktreeAfterDays: null,
      worktreeSettledAfterDays: null,
      worktreeOnMerge: false,
      worktreeOnDelete: false,
      worktreeUnchanged: false,
      worktreeKeepWhen: "uncommitted-changes",
      browserArtifactsAfterDays: null,
      logsAfterDays: null,
    });
  });

  it("accepts partial custom patches but requires complete stored project rules", () => {
    expect(
      decodeServerSettingsPatch({
        worktreeCleanup: { mode: "custom", rules: { worktreeAfterDays: 8 } },
      }),
    ).toEqual({ worktreeCleanup: { mode: "custom", rules: { worktreeAfterDays: 8 } } });
    expect(() =>
      decodeServerSettings({
        projectSettingsOverrides: {
          project: { worktreeCleanup: { mode: "custom", rules: { worktreeAfterDays: 8 } } },
        },
      }),
    ).toThrow();
    expect(
      decodeServerSettings({
        projectSettingsOverrides: {
          project: {
            worktreeCleanup: {
              mode: "custom",
              rules: {
                worktreeAfterDays: null,
                worktreeOnMerge: false,
                worktreeOnDelete: false,
                worktreeUnchanged: false,
              },
            },
          },
        },
      }).projectSettingsOverrides[ProjectId.make("project")]?.worktreeCleanup,
    ).toMatchObject({
      mode: "custom",
      rules: { worktreeSettledAfterDays: null, worktreeKeepWhen: "uncommitted-changes" },
    });
  });

  it("decodes older custom rules with the default local-file policy", () => {
    const settings = decodeServerSettings({
      worktreeCleanup: {
        mode: "custom",
        rules: {
          worktreeAfterDays: 8,
          worktreeOnMerge: false,
          worktreeOnDelete: false,
          worktreeUnchanged: false,
        },
      },
    });
    expect(settings.worktreeCleanup).toMatchObject({
      rules: { worktreeKeepWhen: "uncommitted-changes" },
    });
    expect(
      decodeServerSettingsPatch({ storageCleanup: { worktreeKeepWhen: "tracked-changes" } }),
    ).toEqual({ storageCleanup: { worktreeKeepWhen: "tracked-changes" } });
    expect(() =>
      decodeServerSettingsPatch({ storageCleanup: { worktreeKeepWhen: "unknown" } }),
    ).toThrow();
  });
});

describe("ServerSettings usage price overrides", () => {
  const prices = { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 };

  it("rejects empty model IDs and incomplete input/output pricing", () => {
    for (const usagePriceOverrides of [
      { " ": prices },
      { "example-model": { inputCostPerMillionTokens: 2 } },
      { "example-model": { outputCostPerMillionTokens: 8 } },
    ]) {
      expect(() => decodeServerSettingsPatch({ usagePriceOverrides })).toThrow();
    }
  });
});

describe("ServerSettings secret providers", () => {
  const onePassword = (account: string) => ({
    kind: "one_password",
    label: "Personal",
    config: { account },
  });

  it("keeps an unknown kind or a longer label from invalidating the rest of the settings", () => {
    const openbao = { kind: "openbao", label: "V".repeat(65), config: { address: "https://x" } };
    const decoded = decodeServerSettings({
      worktreesDirectory: "/work",
      secretProviders: { vault: openbao, personal: onePassword("my.1password.com") },
    });
    expect(decoded.worktreesDirectory).toBe("/work");
    expect(encodeServerSettings(decoded).secretProviders).toEqual({
      vault: openbao,
      personal: onePassword("my.1password.com"),
    });
  });

  it("accepts slug ids and null removals but no id that is not a slug", () => {
    expect(
      decodeServerSettingsPatch({
        secretProviders: { "1password": onePassword("my.1password.com"), work: null },
      }).secretProviders,
    ).toEqual({ "1password": onePassword("my.1password.com"), work: null });
    for (const id of ["", "My Vault", "a/b", "-vault"]) {
      expect(() =>
        decodeServerSettingsPatch({ secretProviders: { [id]: onePassword("my.1password.com") } }),
      ).toThrow();
    }
    expect(() =>
      decodeServerSettingsPatch({
        secretProviders: { work: { ...onePassword("my.1password.com"), label: "V".repeat(65) } },
      }),
    ).toThrow();
  });

  it("stores a provider environment secret reference in a layout older builds still decode", () => {
    const providerInstances = (secret: unknown) => ({
      codex: {
        driver: "codex",
        environment: [
          { name: "OPENAI_API_KEY", sensitive: true, value: "", secret },
          { name: "BASE_URL", value: "https://example.test" },
        ],
      },
    });
    const secret = { provider: "personal", reference: "op://Private/OpenAI/credential" };
    const environment = decodeServerSettings({ providerInstances: providerInstances(secret) })
      .providerInstances[ProviderInstanceId.make("codex")]?.environment;
    expect(environment).toEqual([
      { name: "OPENAI_API_KEY", value: secret, sensitive: true },
      { name: "BASE_URL", value: "https://example.test", sensitive: false },
    ]);

    const encoded = encodeProviderInstanceEnvironment(environment ?? []);
    expect(encoded).toEqual([
      { name: "OPENAI_API_KEY", value: "", sensitive: true, secret },
      { name: "BASE_URL", value: "https://example.test", sensitive: false },
    ]);
    expect(decodeProviderInstanceEnvironment(encoded)).toEqual(environment);
    expect(decodeStringOnlyEnvironment(encoded)).toEqual([
      { name: "OPENAI_API_KEY", value: "", sensitive: true },
      { name: "BASE_URL", value: "https://example.test", sensitive: false },
    ]);

    for (const invalid of [
      { provider: "My Vault", reference: "op://a/b/c" },
      { provider: "personal", reference: " " },
      { provider: "personal", reference: "op://Private/OpenAI\n/credential" },
      { provider: "personal", reference: "x".repeat(1025) },
    ]) {
      expect(() =>
        decodeServerSettings({ providerInstances: providerInstances(invalid) }),
      ).toThrow();
    }
  });
});

describe("custom model settings", () => {
  const capabilities = {
    optionDescriptors: [
      {
        id: "effort",
        label: "Reasoning",
        type: "select",
        options: [{ id: "high", label: "High", isDefault: true }],
      },
    ],
  };

  it("accepts legacy bare slugs alongside full entries", () => {
    const decoded = decodeClaudeSettings({
      customModels: ["bare-slug", { slug: "named", name: "Named", capabilities }],
    });
    expect(decoded.customModels).toEqual([
      "bare-slug",
      { slug: "named", name: "Named", capabilities },
    ]);
  });
});

describe("resolveIdleCompaction", () => {
  it("lets a Claude instance override the global default", () => {
    const settings = decodeServerSettings({
      idleCompaction: "off",
      providerInstances: {
        claude_work: { driver: "claudeAgent", config: { idleCompaction: "onReturn" } },
        claude_personal: { driver: "claudeAgent" },
      },
    });
    expect(resolveIdleCompaction(settings, ProviderInstanceId.make("claude_work"))).toBe(
      "onReturn",
    );
    expect(resolveIdleCompaction(settings, ProviderInstanceId.make("claude_personal"))).toBe("off");
    expect(resolveIdleCompaction(settings, ProviderInstanceId.make("claudeAgent"))).toBe("off");
  });

  it("reads the mode from the legacy switch, in either form servers saved it", () => {
    expect(globalIdleCompaction(decodeServerSettings({ compactIdleThreads: true }))).toBe(
      "beforeCacheExpires",
    );
    expect(globalIdleCompaction(decodeServerSettings({ compactIdleThreads: "off" }))).toBe("off");
    expect(globalIdleCompaction(decodeServerSettings({}))).toBe("onReturn");
  });

  it("keeps the legacy switch a boolean, as shipped clients decode it", () => {
    const encode = Schema.encodeSync(Schema.toCodecJson(ServerSettings));
    for (const mode of ["onReturn", "beforeCacheExpires", "off"] as const) {
      const encoded = encode(withIdleCompaction(DEFAULT_SERVER_SETTINGS, mode)) as {
        readonly compactIdleThreads: unknown;
        readonly idleCompaction: unknown;
      };
      expect(encoded.compactIdleThreads).toBe(mode === "beforeCacheExpires");
      expect(encoded.idleCompaction).toBe(mode);
    }
  });

  it("patches the field the server reads", () => {
    expect(
      idleCompactionPatch({ compactIdleThreads: false, idleCompaction: "onReturn" }, "off"),
    ).toEqual({
      idleCompaction: "off",
    });
    expect(idleCompactionPatch({ compactIdleThreads: "onReturn" }, "off")).toEqual({
      compactIdleThreads: "off",
    });
    expect(idleCompactionPatch({ compactIdleThreads: false }, "beforeCacheExpires")).toEqual({
      compactIdleThreads: true,
    });
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

describe("ClientSettings notifications", () => {
  it("requires opt-in when existing settings omit notification preferences", () => {
    expect(decodeClientSettings({}).notificationMode).toBe("off");
    expect(decodeClientSettings({}).inAppNotificationsEnabled).toBe(false);
    expect(decodeClientSettingsPatch({})).not.toHaveProperty("inAppNotificationsEnabled");
    expect(decodeClientSettingsPatch({})).not.toHaveProperty("notificationMode");
  });
});

describe("ClientSettings quit confirmation", () => {
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

describe("ClientSettings recording input overlays", () => {
  it("defaults both overlays off and accepts independent opt-ins", () => {
    const settings = decodeClientSettings({});
    expect(settings.browserRecordingShowKeyPresses).toBe(false);
    expect(settings.browserRecordingShowMousePresses).toBe(false);
    expect(
      decodeClientSettingsPatch({
        browserRecordingShowKeyPresses: true,
        browserRecordingShowMousePresses: false,
      }),
    ).toMatchObject({
      browserRecordingShowKeyPresses: true,
      browserRecordingShowMousePresses: false,
    });
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
  it("defaults to Void's own sidebar", () => {
    const settings = decodeClientSettings({});
    expect(settings.voidSidebarEnabled).toBe(true);
    expect(settings.legacySidebarEnabled).toBe(false);
    expect(settings.sidebarProjectGroups).toEqual([]);
    expect(settings.sidebarActiveProjectGroupId).toBeNull();
  });

  it("preserves an explicit opt-out of the Void sidebar", () => {
    expect(decodeClientSettings({ voidSidebarEnabled: false }).voidSidebarEnabled).toBe(false);
    expect(decodeClientSettingsPatch({ voidSidebarEnabled: false }).voidSidebarEnabled).toBe(false);
  });

  it("drops the retired sidebarV2Enabled key so nobody keeps an inverted opt-in", () => {
    expect(decodeClientSettings({ sidebarV2Enabled: true })).not.toHaveProperty("sidebarV2Enabled");
    expect(decodeClientSettings({ sidebarV2Enabled: true }).voidSidebarEnabled).toBe(true);
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

  it("drops the retired compact sidebar keys for users who opted in", () => {
    const stored = { compactSidebarEnabled: true, sidebarCompactThreadRows: true };
    const decoded = decodeClientSettings(stored);
    expect(decoded).not.toHaveProperty("compactSidebarEnabled");
    expect(decoded).not.toHaveProperty("sidebarCompactThreadRows");
    expect(decodeClientSettingsPatch(stored)).toEqual({});
  });

  it("preserves an explicit legacy sidebar opt-in", () => {
    expect(decodeClientSettings({ legacySidebarEnabled: true }).legacySidebarEnabled).toBe(true);
    expect(decodeClientSettingsPatch({ legacySidebarEnabled: true }).legacySidebarEnabled).toBe(
      true,
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

describe("ClientSettings send shortcut", () => {
  it("defaults to Enter and validates the supported choices", () => {
    expect(decodeClientSettings({}).sendShortcut).toBe("enter");
    for (const sendShortcut of ["enter", "mod-enter-multiline", "mod-enter"]) {
      expect(decodeClientSettings({ sendShortcut }).sendShortcut).toBe(sendShortcut);
      expect(decodeClientSettingsPatch({ sendShortcut }).sendShortcut).toBe(sendShortcut);
    }
    expect(() => decodeClientSettingsPatch({ sendShortcut: "invalid" })).toThrow();
  });
});

describe("ClientSettings follow-up behavior", () => {
  it("defaults to steer and accepts either behavior", () => {
    expect(decodeClientSettings({}).followUpBehavior).toBe("steer");
    for (const followUpBehavior of ["queue", "steer"]) {
      expect(decodeClientSettings({ followUpBehavior }).followUpBehavior).toBe(followUpBehavior);
      expect(decodeClientSettingsPatch({ followUpBehavior }).followUpBehavior).toBe(
        followUpBehavior,
      );
    }
    expect(() => decodeClientSettingsPatch({ followUpBehavior: "invalid" })).toThrow();
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

describe("ClientSettings pull request merge methods", () => {
  it("defaults to no project overrides and accepts supported methods", () => {
    expect(decodeClientSettings({}).pullRequestMergeMethodOverrides).toEqual({});
    expect(
      decodeClientSettingsPatch({
        pullRequestMergeMethodOverrides: { project: "squash" },
      }).pullRequestMergeMethodOverrides,
    ).toEqual({ project: "squash" });
  });

  it("rejects unsupported project merge methods", () => {
    expect(() =>
      decodeClientSettingsPatch({
        pullRequestMergeMethodOverrides: { project: "fast-forward" },
      }),
    ).toThrow();
  });
});

describe("ServerSettings.providerInstances (slice-2 invariant)", () => {
  it("defaults to an empty record so legacy configs without the key still decode", () => {
    expect(DEFAULT_SERVER_SETTINGS.providerInstances).toEqual({});
  });

  it("decodes a fully empty config (legacy on-disk shape) without complaint", () => {
    const decoded = decodeServerSettings({});
    expect(decoded.providerInstances).toEqual({});
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
  it("resolves instance enabled state with explicit false winning", () => {
    const grok = ProviderDriverKind.make("grok");
    const codex = ProviderDriverKind.make("codex");
    expect(resolveProviderInstanceEnabled({ driver: grok, config: {} })).toBe(false);
    expect(resolveProviderInstanceEnabled({ driver: codex, config: {} })).toBe(true);
    expect(
      resolveProviderInstanceEnabled({ driver: ProviderDriverKind.make("ollama"), config: {} }),
    ).toBe(true);
    expect(resolveProviderInstanceEnabled({ driver: grok, enabled: true, config: {} })).toBe(true);
    expect(resolveProviderInstanceEnabled({ driver: codex, enabled: false, config: {} })).toBe(
      false,
    );
    expect(resolveProviderInstanceEnabled({ driver: grok, config: { enabled: true } })).toBe(true);
    expect(
      resolveProviderInstanceEnabled({ driver: grok, enabled: true, config: { enabled: false } }),
    ).toBe(false);
    expect(
      resolveProviderInstanceEnabled({ driver: codex, enabled: false, config: { enabled: true } }),
    ).toBe(false);
  });
});

describe("ServerSettings worktree defaults", () => {
  it("defaults the thread env mode to inherit and keeps stored values", () => {
    expect(decodeServerSettings({}).defaultThreadEnvMode).toBeNull();
    expect(decodeServerSettings({ defaultThreadEnvMode: "worktree" }).defaultThreadEnvMode).toBe(
      "worktree",
    );
    expect(
      decodeServerSettings({ defaultThreadEnvMode: "remote" }).defaultThreadEnvMode,
    ).toBeNull();
    expect(
      decodeServerSettingsPatch({ defaultThreadEnvMode: null }).defaultThreadEnvMode,
    ).toBeNull();
  });

  it("keeps an inherited thread env mode off the wire for older clients", () => {
    const encode = Schema.encodeSync(ServerSettings);
    expect("defaultThreadEnvMode" in encode(decodeServerSettings({}))).toBe(false);
    expect(
      encode(decodeServerSettings({ defaultThreadEnvMode: "worktree" })).defaultThreadEnvMode,
    ).toBe("worktree");
  });
});

describe("ServerSettings.sourceControlWritingStyle", () => {
  it.each([
    { legacy: "", mode: "repo_conventions", customInstructions: "" },
    { legacy: " \t\n ", mode: "repo_conventions", customInstructions: "" },
    {
      legacy: "  Prefer concise wording.\nKeep issue references.  ",
      mode: "custom",
      customInstructions: "Prefer concise wording.\nKeep issue references.",
    },
  ])("normalizes legacy writing style $legacy in snapshots only", ({ legacy, ...expected }) => {
    const style = { ...expected, followChangeRequestTemplates: true };
    for (const [input, normalized] of [
      [{ sourceControlWritingStyle: legacy }, { sourceControlWritingStyle: style }],
      [
        { projectSettingsOverrides: { project: { sourceControlWritingStyle: legacy } } },
        { projectSettingsOverrides: { project: { sourceControlWritingStyle: style } } },
      ],
    ] as const) {
      const settings = decodeServerSettings(input);
      expect(settings).toMatchObject(normalized);
      expect(encodeServerSettings(settings)).toMatchObject(normalized);
      expect(() => decodeServerSettingsPatch(input)).toThrow();
    }
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

    expect(settings.workspaceThreadTabs).toEqual({
      version: 0,
      byWorkspaceKey: {},
      groupsByWorkspaceKey: {},
    });
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

  it("keeps tab group names, colors, and membership", () => {
    const decoded = decodeClientSettings({
      workspaceThreadTabs: {
        version: 4,
        byWorkspaceKey: {
          workspace: [
            { environmentId: "env-1", threadId: "thread-a", groupId: "group-1" },
            { environmentId: "env-1", threadId: "thread-b" },
          ],
        },
        groupsByWorkspaceKey: {
          workspace: [{ id: "group-1", name: "Research", color: "blue" }],
        },
      },
    });

    expect(decoded.workspaceThreadTabs.byWorkspaceKey.workspace?.map((tab) => tab.groupId)).toEqual(
      ["group-1", null],
    );
    expect(decoded.workspaceThreadTabs.groupsByWorkspaceKey.workspace).toEqual([
      { id: "group-1", name: "Research", color: "blue" },
    ]);
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

describe("ServerSettings environment icon", () => {
  it("decodes a kind from a newer server as null instead of failing the snapshot", () => {
    expect(decodeServerSettings({ environmentIcon: "toaster" }).environmentIcon).toBeNull();
  });
});

const decodeDeviceHostSettings = Schema.decodeSync(ServerSettings);

// `deviceHosts` as it was decoded before EAS hosts existed: an SSH host needs a target.
const decodeOlderDeviceHostSettings = Schema.decodeUnknownSync(
  Schema.Struct({
    deviceHosts: Schema.Array(Schema.Struct({ id: Schema.String, target: Schema.String })),
  }),
);

it("keeps EAS hosts out of the SSH host list servers and clients before EAS hosts decode", () => {
  const settings = decodeDeviceHostSettings({
    deviceHosts: [{ id: "mini", label: "Mac mini", target: "user@mini" }],
    easDeviceHosts: [{ kind: "eas", id: "eas", label: "EAS Simulator" }],
  });
  const wire = encodeServerSettings(settings);
  expect(decodeOlderDeviceHostSettings(wire).deviceHosts).toEqual([
    { id: "mini", target: "user@mini" },
  ]);
  expect(settings.easDeviceHosts.map((host) => host.id)).toEqual(["eas"]);
});

it("validates remote device hosts and rejects ambiguous host ids", () => {
  const host = { id: "mini", label: "Mac mini", target: "user@mini", port: 2222 };
  // Hosts saved before EAS hosts existed have no `kind`; they are SSH hosts.
  expect(decodeDeviceHostSettings({ deviceHosts: [host] }).deviceHosts).toEqual([
    { kind: "ssh", ...host },
  ]);
  expect(() => decodeDeviceHostSettings({ deviceHosts: [host, host] })).toThrow();
  expect(() => decodeDeviceHostSettings({ deviceHosts: [{ ...host, id: "local" }] })).toThrow();
  expect(() =>
    decodeDeviceHostSettings({ deviceHosts: [{ ...host, target: "-oProxyCommand=bad" }] }),
  ).toThrow();
  expect(() => decodeDeviceHostSettings({ deviceHosts: [{ ...host, port: 0 }] })).toThrow();
});

describe("ServerSettings project overrides across versions", () => {
  it("sends back an override key from a newer server when an older client edits the entry", () => {
    const projectId = ProjectId.make("project-a");
    // As an older client reads a newer server's settings, with one key it does not know.
    const entry = decodeServerSettings({
      projectSettingsOverrides: {
        [projectId]: { defaultAutoPull: true, addedByNewerServer: { mode: "kept" } },
      },
    }).projectSettingsOverrides[projectId];

    const sent = encodeServerSettingsPatch({
      projectSettingsOverrides: { [projectId]: { ...entry, defaultAutoPull: false } },
    });

    expect(decodeServerSettingsPatch(sent).projectSettingsOverrides?.[projectId]).toEqual({
      defaultAutoPull: false,
      addedByNewerServer: { mode: "kept" },
    });
  });
});

describe("resolveProjectProviderInstanceEnabled", () => {
  const projectId = "project-a" as ProjectId;
  const instanceId = ProviderInstanceId.make("codex_work");

  it("lets a project disable an instance the machine enabled", () => {
    const settings: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [instanceId]: { driver: ProviderDriverKind.make("codex"), enabled: true },
      },
      projectSettingsOverrides: {
        [projectId]: { providerInstances: { [instanceId]: { enabled: false } } },
      },
    };
    expect(resolveProjectProviderInstanceEnabled(settings, projectId, instanceId)).toBe(false);
  });
});

describe("requiredScopesForProjectMutation", () => {
  it("adds the settings scope only when a mutation carries scripts", () => {
    const projectId = "project-1" as ProjectId;
    const commandId = "command-1" as CommandId;
    expect(
      requiredScopesForProjectMutation({ type: "project.update", commandId, projectId }),
    ).toEqual(["orchestration:operate"]);
    expect(
      requiredScopesForProjectMutation({
        type: "project.update",
        commandId,
        projectId,
        scripts: [],
      }),
    ).toEqual(["orchestration:operate", "settings:write"]);
  });
});

describe("server model preferences", () => {
  it("distinguishes unmigrated lists from deliberately cleared lists", () => {
    expect(decodeServerSettings({})).toMatchObject({
      favorites: null,
      providerModelPreferences: null,
    });
    const input = { favorites: [], providerModelPreferences: {} };
    expect(encodeServerSettings(decodeServerSettings(input))).toMatchObject(input);
    expect(decodeServerSettingsPatch(input)).toEqual(input);
  });
});
