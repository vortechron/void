import { describe, expect, it } from "vite-plus/test";

import { resolveSettingsSyncAction, serializeSyncedValue } from "./settingsSync";

const base = {
  hydrated: true,
  remoteSerialized: "{}",
  localSerialized: "{}",
  agreedSerialized: null as string | null,
  remoteIsEmpty: true,
  localIsEmpty: true,
};

describe("serializeSyncedValue", () => {
  it("ignores key order so a re-serialized record compares equal", () => {
    expect(serializeSyncedValue({ b: [1], a: [2] })).toBe(serializeSyncedValue({ a: [2], b: [1] }));
  });

  it("keeps array order, which is tab order", () => {
    expect(serializeSyncedValue(["a", "b"])).not.toBe(serializeSyncedValue(["b", "a"]));
  });
});

describe("resolveSettingsSyncAction", () => {
  it("waits for settings to land", () => {
    expect(resolveSettingsSyncAction({ ...base, hydrated: false })).toBe("idle");
  });

  it("adopts what this browser already had when the server has nothing", () => {
    expect(
      resolveSettingsSyncAction({
        ...base,
        localSerialized: '{"w":[{"environmentId":"e","threadId":"t"}]}',
        localIsEmpty: false,
      }),
    ).toBe("adopt-local");
  });

  it("takes the server value once the two sides have exchanged once", () => {
    expect(
      resolveSettingsSyncAction({
        ...base,
        remoteSerialized: '{"w":["b"]}',
        localSerialized: '{"w":["a"]}',
        agreedSerialized: '{"w":["a"]}',
        remoteIsEmpty: false,
        localIsEmpty: false,
      }),
    ).toBe("apply-remote");
  });

  it("applies an emptied server value rather than re-adopting local", () => {
    expect(
      resolveSettingsSyncAction({
        ...base,
        localSerialized: '{"w":["a"]}',
        agreedSerialized: '{"w":["a"]}',
        localIsEmpty: false,
      }),
    ).toBe("apply-remote");
  });

  it("ignores the echo of this device's own write", () => {
    expect(
      resolveSettingsSyncAction({
        ...base,
        remoteSerialized: '{"w":["a"]}',
        localSerialized: '{"w":["a"]}',
        agreedSerialized: '{"w":["a"]}',
        remoteIsEmpty: false,
        localIsEmpty: false,
      }),
    ).toBe("idle");
  });

  it("does nothing when the sides already match", () => {
    expect(
      resolveSettingsSyncAction({
        ...base,
        remoteSerialized: '{"w":["a"]}',
        localSerialized: '{"w":["a"]}',
        remoteIsEmpty: false,
        localIsEmpty: false,
      }),
    ).toBe("idle");
  });
});
