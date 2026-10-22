import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import { mergeEnvironmentSettings } from "./useSettings";

describe("mergeEnvironmentSettings", () => {
  it("keeps server settlement settings when legacy client data contains retired keys", () => {
    const serverSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      sidebarAutoSettleAfterDays: 14,
      sidebarAutoSettleOnMerge: false,
    };
    const legacyClientSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      sidebarAutoSettleAfterDays: 1,
      sidebarAutoSettleOnMerge: true,
    };

    const settings = mergeEnvironmentSettings(serverSettings, legacyClientSettings);

    expect(settings.sidebarAutoSettleAfterDays).toBe(14);
    expect(settings.sidebarAutoSettleOnMerge).toBe(false);
  });
});

it("uses the environment's model preferences after migration, including empty lists", () => {
  const client = {
    ...DEFAULT_CLIENT_SETTINGS,
    favorites: [{ provider: ProviderInstanceId.make("codex_work"), model: "old" }],
    providerModelPreferences: { codex_work: { hiddenModels: ["old"], modelOrder: [] } },
  };
  expect(mergeEnvironmentSettings(DEFAULT_SERVER_SETTINGS, client).favorites).toEqual(
    client.favorites,
  );
  const merged = mergeEnvironmentSettings(
    { ...DEFAULT_SERVER_SETTINGS, favorites: [], providerModelPreferences: {} },
    client,
  );
  expect(merged.favorites).toEqual([]);
  expect(merged.providerModelPreferences).toEqual({});
});
