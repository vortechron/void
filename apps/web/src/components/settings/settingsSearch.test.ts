import { describe, expect, it, vi } from "vite-plus/test";

import {
  filterAvailableSettingsSearchItems,
  searchableSetting,
  searchSettings,
  SETTINGS_SEARCH_ITEMS,
  SETTINGS_SECTION_LABELS,
  type SettingsSearchItem,
} from "./settingsSearch";

const ITEMS: ReadonlyArray<SettingsSearchItem> = [
  {
    id: "word-wrap",
    title: "Word wrap",
    to: "/settings/general",
    searchTerms: ["long lines in code previews"],
  },
  {
    id: "network-access",
    title: "Network access",
    to: "/settings/connections",
    searchTerms: ["remote pairing backend"],
  },
  {
    id: "providers",
    title: "Providers",
    to: "/settings/providers",
    searchTerms: ["claude codex agents"],
  },
  {
    id: "provider-updates",
    title: "Update checks",
    to: "/settings/general",
  },
  {
    id: "automatic-updates",
    title: "Automatic updates",
    to: "/settings/general",
  },
];

describe("searchSettings", () => {
  it("matches titles, sections, and remembered setting details", () => {
    expect(searchSettings("word", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("network", ITEMS).map((item) => item.id)).toEqual(["network-access"]);
    expect(searchSettings("connections", ITEMS).map((item) => item.id)).toEqual(["network-access"]);
    expect(searchSettings("claude", ITEMS).map((item) => item.id)).toEqual(["providers"]);
    expect(searchSettings("long lines", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
  });

  it("matches normalized title substrings", () => {
    expect(searchSettings("  WORD   WRAP  ", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("project new thread workspace").map((item) => item.id)).toEqual([
      "project-new-thread-workspace",
      "new-threads",
    ]);
    expect(searchSettings("glass").map((item) => item.id)).toEqual(["setting-glass-opacity"]);
    expect(searchSettings("panel animations").map((item) => item.id)).toEqual(["panel-animations"]);
    expect(searchSettings("thè\u{1ab0}mes")[0]?.id).toBe("theme");
    const localeLowerCase = vi.spyOn(String.prototype, "toLocaleLowerCase").mockReturnValue("gıt");
    try {
      expect(searchSettings("GIT")[0]?.id).toBe("git-fetch-interval");
      expect(localeLowerCase).not.toHaveBeenCalled();
    } finally {
      localeLowerCase.mockRestore();
    }
    expect(searchSettings("xyzzy")).toEqual([]);
  });

  it("keeps catalog order for multiple title matches", () => {
    expect(searchSettings("update", ITEMS).map((item) => item.id)).toEqual([
      "provider-updates",
      "automatic-updates",
    ]);
  });

  it("matches query words across fields and ranks the strongest result first", () => {
    expect(searchSettings("pairing remote", ITEMS).map((item) => item.id)).toEqual([
      "network-access",
    ]);
    expect(
      searchSettings("remote pairing")
        .slice(0, 2)
        .map((item) => item.id),
    ).toEqual(["network-access", "connections-environment"]);
  });

  it("finds settings that used to be reachable only through their section", () => {
    expect(searchSettings("pull request template")[0]?.id).toBe("follow-change-request-templates");
    expect(searchSettings("git security keys")[0]?.id).toBe("git-fetch-interval");
    expect(searchSettings("push notifications")[0]?.id).toBe("publish-agent-activity");
    expect(searchSettings("battery saver")[0]?.id).toBe("background-activity");
    expect(searchSettings("binary path")[0]?.id).toBe("providers");
    expect(searchSettings("Antigravity")[0]?.id).toBe("providers");
    expect(searchSettings("Google sign in")[0]?.id).toBe("providers");
    expect(searchSettings("authorized clients")[0]?.id).toBe("connections-environment");
    expect(searchSettings("administrative access")[0]?.id).toBe("connections-environment");
  });

  it("lists thread confirmations in panel order", () => {
    expect(searchSettings("confirmation").map((item) => item.id)).toEqual([
      "unpin-confirmation",
      "archive-confirmation",
      "delete-confirmation",
    ]);
  });

  it.each(["usage providers", "CLIProxyAPI", "CLI proxy hub", "management key"])(
    "finds usage-provider management by %s",
    (query) => {
      expect(searchSettings(query)[0]).toMatchObject({
        id: "usage-providers",
        to: "/settings/providers",
      });
    },
  );

  it("returns no results for an empty query", () => {
    expect(searchSettings("   ", ITEMS)).toEqual([]);
  });

  it("hides desktop-only settings from browser search", () => {
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.id === "quit-confirmation")).toBe(true);
    expect(searchSettings("hold to quit")).toEqual([]);
    expect(searchSettings("wsl")).toEqual([]);
  });

  it("hides macOS-only settings on other platforms", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    try {
      expect(searchSettings("font smoothing")).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("registers the WSL backend as a desktop-only setting", () => {
    expect(SETTINGS_SEARCH_ITEMS.find((item) => item.id === "wsl-backend")).toMatchObject({
      id: "wsl-backend",
      title: "WSL backend",
      to: "/settings/connections",
      desktopOnly: true,
      windowsOnly: true,
    });
  });

  it("hides settings whose controls are unavailable", () => {
    const available = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasPrimaryEnvironment: false,
      hasProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: false,
    });

    const gatedIds = new Set<string>([
      "follow-change-request-templates",
      "git-fetch-interval",
      "network-access",
      "publish-agent-activity",
      "provider-health-check-interval",
      "source-control-writer-model",
      "source-control-writing-style",
      "t3-connect",
      "tailscale-https",
      "wsl-backend",
      "auto-settle-inactive-threads",
      "auto-settle-merged-threads",
      "days-before-auto-settle",
    ]);
    expect(available.map((item) => item.id).filter((id) => gatedIds.has(id))).toEqual([]);
  });

  it("shows automatic settlement settings when the server supports them", () => {
    const available = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasPrimaryEnvironment: false,
      hasProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: true,
    });

    expect(searchSettings("auto-settle", available).map((item) => item.id)).toEqual([
      "auto-settle-inactive-threads",
      "auto-settle-merged-threads",
      "days-before-auto-settle",
    ]);
  });

  it("keeps catalog result ids unique", () => {
    const ids = SETTINGS_SEARCH_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("serves anchor props to panels from the catalog", () => {
    expect(searchableSetting("word-wrap")).toEqual({ id: "word-wrap", title: "Word wrap" });
    expect(searchableSetting("archive")).toEqual({ id: "archive", title: "Archived threads" });
  });

  it("routes appearance settings to their current section", () => {
    expect(searchSettings("theme")[0]).toMatchObject({
      id: "theme",
      to: "/settings/appearance",
    });
    expect(searchSettings("UI font size")[0]).toMatchObject({
      id: "ui-font-size",
      to: "/settings/appearance",
    });
    expect(searchSettings("code theme")[0]).toMatchObject({
      id: "code-theme",
      to: "/settings/appearance",
    });
    expect(searchSettings("word wrap")[0]).toMatchObject({
      id: "word-wrap",
      to: "/settings/appearance",
    });
    expect(searchSettings("environment identification")[0]).toMatchObject({
      id: "environment-identification",
      to: "/settings/appearance",
      targetId: "appearance-interface",
    });
  });

  it("routes every voice setting to the Voice section", () => {
    // These four used to live in General; a stale entry here would deep-link
    // the user to a page the row is no longer on.
    for (const query of [
      "Voice dictation",
      "OpenAI API key",
      "Dictation model",
      "Dictation language",
      "Cleanup style",
      "Cleanup instructions",
      "Cleanup model",
      "Dictionary",
      "Snippets",
    ]) {
      expect(searchSettings(query)[0]).toMatchObject({ to: "/settings/voice" });
    }
  });

  it("puts Voice in the sidebar right after Appearance", () => {
    // The label record's key order is the sidebar order.
    const sections = Object.keys(SETTINGS_SECTION_LABELS);
    expect(sections.indexOf("/settings/voice")).toBe(sections.indexOf("/settings/appearance") + 1);
    expect(sections.indexOf("/settings/voice")).toBeLessThan(
      sections.indexOf("/settings/keybindings"),
    );
  });

  it("gives every catalog entry a section that exists in the sidebar", () => {
    for (const item of SETTINGS_SEARCH_ITEMS) {
      expect(SETTINGS_SECTION_LABELS).toHaveProperty(item.to);
    }
  });

  it("routes agent completion alerts to General", () => {
    expect(searchSettings("agent notifications")[0]).toMatchObject({
      id: "agent-notifications",
      to: "/settings/general",
    });
    expect(searchSettings("completion sound")[0]).toMatchObject({
      id: "completion-sound",
      to: "/settings/general",
    });
  });

  it("routes conditional window capture settings to the stable toggle row", () => {
    const targets = [
      "capture accessibility data",
      "capture shortcut",
      "capture sound",
      "capture flash",
      "capture animations",
    ].map((query) => {
      const match = searchSettings(query)[0];
      return [match?.id, match?.targetId];
    });

    expect(targets).toEqual([
      ["snap-shot-accessibility", "snap-shot-enabled"],
      ["snap-shot-shortcut", "snap-shot-enabled"],
      ["snap-shot-sound", "snap-shot-enabled"],
      ["snap-shot-flash", "snap-shot-enabled"],
      ["snap-shot-animations", "snap-shot-enabled"],
    ]);
  });

  it("routes browser recording quality to integrations", () => {
    const result = searchSettings("recording frame rate")[0];
    expect(result).toMatchObject({
      id: "browser-recording-frame-rate",
      to: "/settings/integrations",
    });
    expect(result).not.toHaveProperty("targetId");
  });

  it("routes where links open to integrations", () => {
    expect(searchSettings("open links in")[0]).toMatchObject({
      id: "browser-link-target",
      to: "/settings/integrations",
    });
    expect(searchSettings("external links")[0]).toMatchObject({ id: "browser-link-target" });
  });

  it("finds the default browser profile action in the profiles list", () => {
    expect(searchSettings("default profile")[0]).toMatchObject({
      id: "browser-default-profile",
      to: "/settings/integrations",
      targetId: "browser-profiles",
    });
  });
});
