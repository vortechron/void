import { describe, expect, it } from "vite-plus/test";

import { nextSyncVersion, resolveSettingsSyncAction, serializeSyncedValue } from "./settingsSync";

const base = {
  hydrated: true,
  remoteVersion: 0,
  localVersion: 0,
  sameContent: false,
  localIsEmpty: false,
};

describe("serializeSyncedValue", () => {
  it("ignores key order so a re-serialized record compares equal", () => {
    expect(serializeSyncedValue({ b: [1], a: [2] })).toBe(serializeSyncedValue({ a: [2], b: [1] }));
  });

  it("keeps array order, which is tab order", () => {
    expect(serializeSyncedValue(["a", "b"])).not.toBe(serializeSyncedValue(["b", "a"]));
  });
});

describe("nextSyncVersion", () => {
  it("claims a version past everything either side has seen", () => {
    expect(nextSyncVersion({ localVersion: 2, remoteVersion: 7 })).toBe(8);
    expect(nextSyncVersion({ localVersion: 9, remoteVersion: 7 })).toBe(10);
  });
});

describe("resolveSettingsSyncAction", () => {
  it("waits for settings to land", () => {
    expect(resolveSettingsSyncAction({ ...base, hydrated: false })).toBe("idle");
  });

  it("does nothing when the two sides already hold the same thing", () => {
    expect(
      resolveSettingsSyncAction({ ...base, sameContent: true, remoteVersion: 4, localVersion: 2 }),
    ).toBe("idle");
  });

  it("takes the server value when it is the later edit", () => {
    expect(resolveSettingsSyncAction({ ...base, remoteVersion: 6, localVersion: 5 })).toBe(
      "apply-remote",
    );
  });

  it("takes an emptied server value too — that is a close, not a gap", () => {
    expect(
      resolveSettingsSyncAction({
        ...base,
        remoteVersion: 6,
        localVersion: 5,
        localIsEmpty: false,
      }),
    ).toBe("apply-remote");
  });

  // The bug this counter exists for: closing every tab leaves an empty local
  // set that content alone reads as "not synced yet", so the pre-close set
  // still sitting on the server came back.
  it("does not resurrect a set this device just closed", () => {
    expect(
      resolveSettingsSyncAction({ ...base, remoteVersion: 5, localVersion: 6, localIsEmpty: true }),
    ).toBe("publish-local");
  });

  it("hands an unsynced browser's tabs to a server that has never stored any", () => {
    expect(resolveSettingsSyncAction({ ...base, localIsEmpty: false })).toBe("publish-local");
  });

  it("takes the server's first value when this browser has nothing to offer", () => {
    expect(resolveSettingsSyncAction({ ...base, localIsEmpty: true })).toBe("apply-remote");
  });
});
