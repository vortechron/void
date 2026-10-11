import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import type { CommandId, ProjectId } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";
import {
  ClientSettingsSchema,
  ClientSettingsPatch,
  ClaudeSettings,
  DEFAULT_SERVER_SETTINGS,
  requiredScopesForProjectMutation,
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

describe("ServerSettings response streaming", () => {
  it("defaults to paragraph buffering", () => {
    expect(decodeServerSettings({}).responseStreamingMode).toBe("paragraph");
  });

  it.each(["turn", "paragraph"])(
    "round-trips %s as an environment setting and project override",
    (responseStreamingMode) => {
      const input = {
        responseStreamingMode,
        projectSettingsOverrides: { project: { responseStreamingMode } },
      };
      expect(encodeServerSettings(decodeServerSettings(input))).toMatchObject(input);
      expect(decodeServerSettingsPatch(input)).toEqual(input);
    },
  );

  it.each(["token", "unsupported"])("rejects %s in settings snapshots and writes", (mode) => {
    for (const input of [
      { responseStreamingMode: mode },
      { projectSettingsOverrides: { project: { responseStreamingMode: mode } } },
    ]) {
      expect(() => decodeServerSettings(input)).toThrow();
      expect(() => decodeServerSettingsPatch(input)).toThrow();
    }
  });
});

describe("storage cleanup settings", () => {
  it("keeps cleanup disabled for existing installations", () => {
    expect(decodeServerSettings({}).worktreeCleanup).toBeNull();
    expect(decodeServerSettings({}).storageCleanup).toEqual({
      worktreeAfterDays: null,
      worktreeOnMerge: false,
      worktreeOnDelete: false,
      worktreeUnchanged: false,
      worktreeKeepWhen: "uncommitted-changes",
      browserArtifactsAfterDays: null,
      logsAfterDays: null,
    });
  });

  it("accepts eight-day retention and disabling one rule without resetting others", () => {
    expect(decodeServerSettingsPatch({ storageCleanup: { worktreeAfterDays: 8 } })).toEqual({
      storageCleanup: { worktreeAfterDays: 8 },
    });
    expect(decodeServerSettingsPatch({ storageCleanup: { worktreeAfterDays: null } })).toEqual({
      storageCleanup: { worktreeAfterDays: null },
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

  it.each([0, -1, 1.5, 3651])("rejects invalid retention %s", (days) => {
    expect(() =>
      decodeServerSettingsPatch({ storageCleanup: { browserArtifactsAfterDays: days } }),
    ).toThrow();
  });
});

describe("ClientSettings rich text composer", () => {
  it("enables rich text for new and existing settings without a saved preference", () => {
    expect(decodeClientSettings({}).composerRichTextEnabled).toBe(true);
    expect(decodeClientSettings({ sendShortcut: "mod-enter" }).composerRichTextEnabled).toBe(true);
  });

  it("preserves an explicit opt-out through patches and persistence", () => {
    const preference = { composerRichTextEnabled: false };
    expect(decodeClientSettingsPatch(preference)).toEqual(preference);
    expect(encodeClientSettings(decodeClientSettings(preference))).toMatchObject(preference);
  });
});

describe("ServerSettings default permissions", () => {
  it("keeps full access for settings saved before a default was configured", () => {
    expect(decodeServerSettings({}).defaultRuntimeMode).toBe("full-access");
    expect(DEFAULT_SERVER_SETTINGS.defaultRuntimeMode).toBe("full-access");
  });

  it.each(["approval-required", "auto-accept-edits", "auto", "full-access"])(
    "round-trips %s as an environment default and project override",
    (defaultRuntimeMode) => {
      const input = {
        defaultRuntimeMode,
        projectSettingsOverrides: { project: { defaultRuntimeMode } },
      };
      expect(encodeServerSettings(decodeServerSettings(input))).toMatchObject(input);
      expect(decodeServerSettingsPatch(input)).toEqual(input);
    },
  );

  it("rejects unsupported permission defaults", () => {
    expect(() => decodeServerSettings({ defaultRuntimeMode: "unsupported" })).toThrow();
    expect(() => decodeServerSettingsPatch({ defaultRuntimeMode: "unsupported" })).toThrow();
    expect(() =>
      decodeServerSettingsPatch({
        projectSettingsOverrides: { project: { defaultRuntimeMode: "unsupported" } },
      }),
    ).toThrow();
  });
});

describe("ServerSettings usage price overrides", () => {
  const prices = { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 };

  it("defaults to automatic pricing and round-trips arbitrary model IDs", () => {
    expect(decodeServerSettings({}).usagePriceOverrides).toEqual({});
    const settings = decodeServerSettings({
      usagePriceOverrides: { "  vendor/example-model  ": prices },
    });
    expect(encodeServerSettings(settings).usagePriceOverrides).toEqual({
      "vendor/example-model": prices,
    });
  });

  it("accepts zero rates, optional cache rates, and per-model deletion", () => {
    const overrides = {
      "example-model": {
        inputCostPerMillionTokens: 0,
        outputCostPerMillionTokens: 0,
        cacheReadCostPerMillionTokens: 0.5,
        cacheWriteCostPerMillionTokens: 3,
      },
      "removed-model": null,
    };
    expect(
      decodeServerSettingsPatch({ usagePriceOverrides: overrides }).usagePriceOverrides,
    ).toEqual(overrides);
  });

  it.each([
    "inputCostPerMillionTokens",
    "outputCostPerMillionTokens",
    "cacheReadCostPerMillionTokens",
    "cacheWriteCostPerMillionTokens",
  ])("rejects invalid %s rates at the settings boundary", (field) => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
      const usagePriceOverrides = { "example-model": { ...prices, [field]: value } };
      expect(() => decodeServerSettings({ usagePriceOverrides })).toThrow();
      expect(() => decodeServerSettingsPatch({ usagePriceOverrides })).toThrow();
    }
  });

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

  it.each([true, false])(
    "round-trips in-app notifications set to %s",
    (inAppNotificationsEnabled) => {
      const settings = decodeClientSettings({ inAppNotificationsEnabled });
      expect(encodeClientSettings(settings).inAppNotificationsEnabled).toBe(
        inAppNotificationsEnabled,
      );
      expect(
        decodeClientSettingsPatch({ inAppNotificationsEnabled }).inAppNotificationsEnabled,
      ).toBe(inAppNotificationsEnabled);
    },
  );

  it.each(["true", 1, null])(
    "rejects an invalid in-app notification preference %s",
    (inAppNotificationsEnabled) => {
      expect(() => decodeClientSettings({ inAppNotificationsEnabled })).toThrow();
      expect(() => decodeClientSettingsPatch({ inAppNotificationsEnabled })).toThrow();
    },
  );

  it.each(["off", "notifications", "sound", "notifications-and-sound"])(
    "round-trips the %s mode",
    (notificationMode) => {
      const settings = decodeClientSettings({ notificationMode });
      expect(encodeClientSettings(settings).notificationMode).toBe(notificationMode);
      expect(decodeClientSettingsPatch({ notificationMode }).notificationMode).toBe(
        notificationMode,
      );
    },
  );

  it.each(["always", true, null])(
    "rejects unsupported notification mode %s",
    (notificationMode) => {
      expect(() => decodeClientSettings({ notificationMode })).toThrow();
      expect(() => decodeClientSettingsPatch({ notificationMode })).toThrow();
    },
  );
});

describe("ClientSettings default diff file state", () => {
  it("keeps files collapsed when existing settings omit the preference", () => {
    expect(decodeClientSettings({}).diffFilesCollapsed).toBe(true);
  });

  it.each([true, false])("preserves a saved collapsed preference of %s", (diffFilesCollapsed) => {
    const settings = decodeClientSettings({ diffFilesCollapsed });
    expect(encodeClientSettings(settings).diffFilesCollapsed).toBe(diffFilesCollapsed);
    expect(decodeClientSettingsPatch({ diffFilesCollapsed }).diffFilesCollapsed).toBe(
      diffFilesCollapsed,
    );
  });
});

describe("ClientSettings diff colors", () => {
  it("keeps red and green for existing settings without a saved palette", () => {
    expect(decodeClientSettings({}).diffColorScheme).toBe("red-green");
  });

  it.each(["red-green", "blue-orange"])("round-trips the %s palette", (diffColorScheme) => {
    const settings = decodeClientSettings({ diffColorScheme });
    expect(encodeClientSettings(settings).diffColorScheme).toBe(diffColorScheme);
    expect(decodeClientSettingsPatch({ diffColorScheme }).diffColorScheme).toBe(diffColorScheme);
  });

  it("rejects unsupported palettes", () => {
    expect(() => decodeClientSettings({ diffColorScheme: "purple-yellow" })).toThrow();
    expect(() => decodeClientSettingsPatch({ diffColorScheme: "purple-yellow" })).toThrow();
  });
});

describe("ClientSettings chat width", () => {
  it("keeps the comfortable width for existing settings without a saved width", () => {
    expect(decodeClientSettings({}).chatWidth).toBe("comfortable");
  });

  it.each(["comfortable", "wide", "full"])("round-trips the %s width", (chatWidth) => {
    const settings = decodeClientSettings({ chatWidth });
    expect(encodeClientSettings(settings).chatWidth).toBe(chatWidth);
    expect(decodeClientSettingsPatch({ chatWidth }).chatWidth).toBe(chatWidth);
  });

  it("rejects unsupported widths", () => {
    expect(() => decodeClientSettings({ chatWidth: "huge" })).toThrow();
    expect(() => decodeClientSettingsPatch({ chatWidth: "huge" })).toThrow();
  });
});

describe("ClientSettings load balancing", () => {
  it("requires opt-in when settings are new or omit load balancing", () => {
    expect(decodeClientSettings({}).loadBalancingEnabled).toBe(false);
    expect(decodeClientSettings({ loadBalancingWeights: {} }).loadBalancingEnabled).toBe(false);
  });

  it.each([true, false])("preserves a saved choice of %s", (loadBalancingEnabled) => {
    const settings = decodeClientSettings({ loadBalancingEnabled });
    expect(encodeClientSettings(settings).loadBalancingEnabled).toBe(loadBalancingEnabled);
    expect(decodeClientSettingsPatch({ loadBalancingEnabled }).loadBalancingEnabled).toBe(
      loadBalancingEnabled,
    );
  });
});

describe("ClientSettings composer context strip", () => {
  it("defaults to draft-only and accepts a persistent strip preference", () => {
    expect(decodeClientSettings({}).persistComposerContextStrip).toBe(false);
    expect(
      decodeClientSettingsPatch({ persistComposerContextStrip: true }).persistComposerContextStrip,
    ).toBe(true);
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

describe("ClientSettings window capture", () => {
  it("defaults capture off while keeping its feedback enabled", () => {
    const settings = decodeClientSettings({});

    expect(settings.snapShotEnabled).toBe(false);
    expect(settings.snapShotIncludeAccessibility).toBe(true);
    expect(settings.snapShotShortcut).toEqual({ kind: "both-shift-keys" });
    expect(settings.snapShotPlaySound).toBe(true);
    expect(settings.snapShotSound).toBe("soft-pop");
    expect(settings.snapShotFlash).toBe(true);
    expect(settings.snapShotAnimations).toBe(true);
  });

  it("accepts capture preference updates", () => {
    expect(
      decodeClientSettingsPatch({
        snapShotEnabled: true,
        snapShotIncludeAccessibility: false,
        snapShotShortcut: {
          key: "w",
          metaKey: false,
          ctrlKey: false,
          shiftKey: true,
          altKey: true,
          modKey: false,
        },
        snapShotPlaySound: false,
        snapShotSound: "camera-shutter",
        snapShotFlash: false,
        snapShotAnimations: false,
      }),
    ).toEqual({
      snapShotEnabled: true,
      snapShotIncludeAccessibility: false,
      snapShotShortcut: {
        key: "w",
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: true,
        modKey: false,
      },
      snapShotPlaySound: false,
      snapShotSound: "camera-shutter",
      snapShotFlash: false,
      snapShotAnimations: false,
    });
  });

  it("rejects unknown capture sounds", () => {
    expect(() => decodeClientSettingsPatch({ snapShotSound: "doorbell" })).toThrow();
  });

  it("accepts modifier pair shortcuts", () => {
    expect(
      decodeClientSettingsPatch({
        snapShotShortcut: { kind: "modifier-pair", modifier: "meta" },
      }),
    ).toEqual({
      snapShotShortcut: { kind: "modifier-pair", modifier: "meta" },
    });
    expect(() =>
      decodeClientSettingsPatch({
        snapShotShortcut: { kind: "modifier-pair", modifier: "hyper" },
      }),
    ).toThrow();
  });

  it("rejects a capture shortcut with no modifier", () => {
    expect(() =>
      decodeClientSettingsPatch({
        snapShotShortcut: {
          key: "w",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: false,
        },
      }),
    ).toThrow();
  });
});

describe("ClientSettings proactive panels", () => {
  it("is opt-in and accepts client-local updates", () => {
    expect(decodeClientSettings({}).proactivePanelsEnabled).toBe(false);
    expect(decodeClientSettingsPatch({ proactivePanelsEnabled: true }).proactivePanelsEnabled).toBe(
      true,
    );
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
  it("defaults to queue and accepts either behavior", () => {
    expect(decodeClientSettings({}).followUpBehavior).toBe("queue");
    for (const followUpBehavior of ["queue", "steer"]) {
      expect(decodeClientSettings({ followUpBehavior }).followUpBehavior).toBe(followUpBehavior);
      expect(decodeClientSettingsPatch({ followUpBehavior }).followUpBehavior).toBe(
        followUpBehavior,
      );
    }
    expect(() => decodeClientSettingsPatch({ followUpBehavior: "invalid" })).toThrow();
  });
});

describe("ClientSettings composer collapse", () => {
  it("collapses on scroll by default and accepts opting out", () => {
    expect(decodeClientSettings({}).composerCollapseOnScroll).toBe(true);
    expect(
      decodeClientSettingsPatch({ composerCollapseOnScroll: false }).composerCollapseOnScroll,
    ).toBe(false);
  });

  it("drops the retired blur trigger key", () => {
    const decoded = decodeClientSettings({ composerCollapseOnBlur: false });
    expect(decoded.composerCollapseOnScroll).toBe(true);
    expect(decoded).not.toHaveProperty("composerCollapseOnBlur");
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
  it("keeps Muse disabled until a configured instance opts in", () => {
    const muse = ProviderDriverKind.make("muse");
    expect(resolveProviderInstanceEnabled({ driver: muse, config: {} })).toBe(false);
    expect(resolveProviderInstanceEnabled({ driver: muse, enabled: true, config: {} })).toBe(true);
    expect(
      resolveProviderInstanceEnabled({ driver: muse, enabled: true, config: { enabled: false } }),
    ).toBe(false);
  });

  it("enables only the stable bindings by default", () => {
    const enabledByDefault = (driver: string) =>
      resolveProviderInstanceEnabled({ driver: ProviderDriverKind.make(driver), config: {} });
    expect(enabledByDefault("codex")).toBe(true);
    expect(enabledByDefault("claudeAgent")).toBe(true);
    for (const driver of ["cursor", "grok", "muse", "pi", "opencode", "antigravity"]) {
      expect(enabledByDefault(driver)).toBe(false);
    }
  });

  it("resolves instance enabled state with explicit false winning", () => {
    const grok = ProviderDriverKind.make("grok");
    const codex = ProviderDriverKind.make("codex");
    // No flags anywhere: driver default applies.
    expect(resolveProviderInstanceEnabled({ driver: grok, config: {} })).toBe(false);
    expect(resolveProviderInstanceEnabled({ driver: codex, config: {} })).toBe(true);
    // Unknown fork drivers stay enabled.
    expect(
      resolveProviderInstanceEnabled({ driver: ProviderDriverKind.make("ollama"), config: {} }),
    ).toBe(true);
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

  it("defaults start-from-origin on for legacy configs", () => {
    expect(decodeServerSettings({}).newWorktreesStartFromOrigin).toBe(true);
  });

  it("accepts start-from-origin updates", () => {
    expect(
      decodeServerSettingsPatch({ newWorktreesStartFromOrigin: false }).newWorktreesStartFromOrigin,
    ).toBe(false);
  });

  it("defaults worktree submodules to inherit and tolerates unknown modes", () => {
    expect(decodeServerSettings({}).worktreeSubmodules).toBeNull();
    expect(decodeServerSettings({ worktreeSubmodules: "top-level" }).worktreeSubmodules).toBe(
      "top-level",
    );
    expect(decodeServerSettings({ worktreeSubmodules: "shallow" }).worktreeSubmodules).toBeNull();
    expect(decodeServerSettingsPatch({ worktreeSubmodules: null }).worktreeSubmodules).toBeNull();
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
    });

    expect(encoded.addProjectBaseDirectory).toBe("~/Development");
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
  it("defaults to null", () => {
    expect(decodeServerSettings({}).environmentIcon).toBeNull();
  });

  it("keeps a kind this build knows", () => {
    expect(decodeServerSettings({ environmentIcon: "mac-mini" }).environmentIcon).toBe("mac-mini");
    expect(decodeServerSettings({ environmentIcon: "linux" }).environmentIcon).toBe("linux");
  });

  it("decodes a kind from a newer server as null instead of failing the snapshot", () => {
    expect(decodeServerSettings({ environmentIcon: "toaster" }).environmentIcon).toBeNull();
  });

  it("round-trips through encode", () => {
    const settings = decodeServerSettings({ environmentIcon: "laptop" });
    expect(encodeServerSettings(settings).environmentIcon).toBe("laptop");

    const linuxSettings = decodeServerSettings({ environmentIcon: "linux" });
    expect(encodeServerSettings(linuxSettings).environmentIcon).toBe("linux");
  });
});

const decodeDeviceHostSettings = Schema.decodeSync(ServerSettings);

it("validates remote device hosts and rejects ambiguous host ids", () => {
  const host = { id: "mini", label: "Mac mini", target: "user@mini", port: 2222 };
  expect(decodeDeviceHostSettings({ deviceHosts: [host] }).deviceHosts).toEqual([host]);
  expect(() => decodeDeviceHostSettings({ deviceHosts: [host, host] })).toThrow();
  expect(() => decodeDeviceHostSettings({ deviceHosts: [{ ...host, id: "local" }] })).toThrow();
  expect(() =>
    decodeDeviceHostSettings({ deviceHosts: [{ ...host, target: "-oProxyCommand=bad" }] }),
  ).toThrow();
  expect(() => decodeDeviceHostSettings({ deviceHosts: [{ ...host, port: 0 }] })).toThrow();
});

describe("branch naming settings", () => {
  it("defaults existing settings to the t3 static prefix", () => {
    expect(decodeServerSettings({})).toMatchObject({
      branchNamingMode: "static",
      branchNamePrefix: "t3",
      branchNameInstructions: "",
    });
  });
  it.each(["static", "semantic", "custom"])(
    "round-trips %s and project overrides",
    (branchNamingMode) => {
      const naming = {
        branchNamingMode,
        branchNamePrefix: "team/",
        branchNameInstructions: "Include the issue ID.",
      };
      const input = { ...naming, projectSettingsOverrides: { project: naming } };
      expect(encodeServerSettings(decodeServerSettings(input))).toMatchObject(input);
      expect(decodeServerSettingsPatch(input)).toEqual(input);
    },
  );
});

describe("ServerSettings.removeAgentCreditsOnMerge", () => {
  it("keeps agent credits by default and accepts opt-in patches", () => {
    expect(decodeServerSettings({}).removeAgentCreditsOnMerge).toBe(false);
    expect(
      decodeServerSettingsPatch({ removeAgentCreditsOnMerge: true }).removeAgentCreditsOnMerge,
    ).toBe(true);
    expect(
      decodeServerSettings({
        projectSettingsOverrides: { project: { removeAgentCreditsOnMerge: true } },
      }).projectSettingsOverrides["project" as ProjectId]?.removeAgentCreditsOnMerge,
    ).toBe(true);
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
  it("decodes a visibility update scoped to a provider instance and model", () => {
    const patch = { setModelsHidden: [{ provider: "codex_work", model: "sol", hidden: false }] };
    expect(decodeServerSettingsPatch(patch)).toEqual(patch);
    expect(() =>
      decodeServerSettingsPatch({ setModelsHidden: [{ provider: "codex_work", model: "sol" }] }),
    ).toThrow();
  });
  it("distinguishes unmigrated lists from deliberately cleared lists", () => {
    expect(decodeServerSettings({})).toMatchObject({
      favorites: null,
      providerModelPreferences: null,
    });
    const input = { favorites: [], providerModelPreferences: {} };
    expect(encodeServerSettings(decodeServerSettings(input))).toMatchObject(input);
    expect(decodeServerSettingsPatch(input)).toEqual(input);
  });

  it("round trips favorites and hidden models keyed by provider instance", () => {
    const input = {
      favorites: [{ provider: "codex_work", model: "sol" }],
      providerModelPreferences: { codex_work: { hiddenModels: ["astra"], modelOrder: ["sol"] } },
    };
    expect(encodeServerSettings(decodeServerSettings(input))).toMatchObject(input);
    expect(decodeServerSettingsPatch(input)).toEqual(input);
    expect(decodeServerSettingsPatch({ migrateModelPreferences: input })).toEqual({
      migrateModelPreferences: input,
    });
  });
});
