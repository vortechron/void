import { describe, expect, it } from "vite-plus/test";

import {
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
  },
  {
    id: "network-access",
    title: "Network access",
    to: "/settings/connections",
  },
  {
    id: "providers",
    title: "Providers",
    to: "/settings/providers",
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
  it("matches only setting titles", () => {
    expect(searchSettings("word", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("network", ITEMS).map((item) => item.id)).toEqual(["network-access"]);
    expect(searchSettings("connections", ITEMS)).toEqual([]);
    expect(searchSettings("claude", ITEMS)).toEqual([]);
  });

  it("matches normalized title substrings", () => {
    expect(searchSettings("  WORD   WRAP  ", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("work").map((item) => item.id)).toEqual(["project-new-thread-workspace"]);
    expect(searchSettings("glass").map((item) => item.id)).toEqual(["setting-glass-opacity"]);
    expect(searchSettings("xyzzy")).toEqual([]);
  });

  it("keeps catalog order for multiple title matches", () => {
    expect(searchSettings("update", ITEMS).map((item) => item.id)).toEqual([
      "provider-updates",
      "automatic-updates",
    ]);
  });

  it("lists thread confirmations in panel order", () => {
    expect(searchSettings("confirmation").map((item) => item.id)).toEqual([
      "unpin-confirmation",
      "archive-confirmation",
      "delete-confirmation",
    ]);
  });

  it("returns no results for an empty query", () => {
    expect(searchSettings("   ", ITEMS)).toEqual([]);
  });

  it("hides desktop-only settings from browser search", () => {
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.id === "quit-confirmation")).toBe(true);
    expect(searchSettings("quit confirmation")).toEqual([]);
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
      targetId: "appearance",
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

  it("puts Voice in the sidebar between Appearance and Keybindings", () => {
    // The label record's key order is the sidebar order.
    const sections = Object.keys(SETTINGS_SECTION_LABELS);
    expect(sections.indexOf("/settings/voice")).toBe(sections.indexOf("/settings/appearance") + 1);
    expect(sections.indexOf("/settings/voice")).toBe(sections.indexOf("/settings/keybindings") - 1);
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
});
