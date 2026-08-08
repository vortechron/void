import { describe, expect, it } from "vite-plus/test";

import {
  hasExceededLongPressSlop,
  LONG_PRESS_MENU_OFFSET_Y,
  type LongPressCommand,
  type LongPressInput,
  type LongPressPress,
  reduceLongPress,
  resolveLongPressMenuPosition,
  shouldArmLongPress,
} from "./longPress";

const POINTER_ID = 1;

function touchDown(overrides?: Partial<Extract<LongPressInput, { kind: "down" }>>): LongPressInput {
  return {
    kind: "down",
    pointerId: POINTER_ID,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    x: 100,
    y: 200,
    ...overrides,
  };
}

/** Runs a sequence from idle and returns the resulting press plus the last commands. */
function run(inputs: readonly LongPressInput[]): {
  press: LongPressPress;
  commands: readonly LongPressCommand[];
} {
  let press: LongPressPress = null;
  let commands: readonly LongPressCommand[] = [];
  for (const input of inputs) {
    const result = reduceLongPress(press, input);
    press = result.press;
    commands = result.commands;
  }
  return { press, commands };
}

function kinds(commands: readonly LongPressCommand[]): readonly string[] {
  return commands.map((command) => command.kind);
}

describe("shouldArmLongPress", () => {
  it("arms for touch and pen", () => {
    expect(shouldArmLongPress({ pointerType: "touch", isPrimary: true, button: 0 })).toBe(true);
    expect(shouldArmLongPress({ pointerType: "pen", isPrimary: true, button: 0 })).toBe(true);
  });

  it("ignores mouse so the native contextmenu path keeps owning desktop", () => {
    expect(shouldArmLongPress({ pointerType: "mouse", isPrimary: true, button: 0 })).toBe(false);
  });

  it("ignores a second finger and non-primary buttons", () => {
    expect(shouldArmLongPress({ pointerType: "touch", isPrimary: false, button: 0 })).toBe(false);
    expect(shouldArmLongPress({ pointerType: "touch", isPrimary: true, button: 2 })).toBe(false);
  });
});

describe("hasExceededLongPressSlop", () => {
  const origin = { startX: 0, startY: 0 };

  it("cancels past the threshold on either axis", () => {
    expect(hasExceededLongPressSlop({ ...origin, x: 11, y: 0 })).toBe(true);
    expect(hasExceededLongPressSlop({ ...origin, x: 0, y: -11 })).toBe(true);
  });

  it("tolerates movement at or under the threshold", () => {
    expect(hasExceededLongPressSlop({ ...origin, x: 9, y: 9 })).toBe(false);
    expect(hasExceededLongPressSlop({ ...origin, x: 10, y: 10 })).toBe(false);
  });

  it("honours a custom slop", () => {
    expect(hasExceededLongPressSlop({ ...origin, x: 9, y: 0, slopPx: 4 })).toBe(true);
  });
});

describe("resolveLongPressMenuPosition", () => {
  it("nudges the menu below the fingertip", () => {
    expect(resolveLongPressMenuPosition({ x: 40, y: 60 })).toEqual({
      x: 40,
      y: 60 + LONG_PRESS_MENU_OFFSET_Y,
    });
  });
});

describe("reduceLongPress", () => {
  it("arms on a touch press", () => {
    const { press, commands } = run([touchDown()]);
    expect(kinds(commands)).toEqual(["arm"]);
    expect(press).toMatchObject({ pointerId: POINTER_ID, startX: 100, startY: 200, fired: false });
  });

  it("stays idle for a mouse press", () => {
    const { press, commands } = run([touchDown({ pointerType: "mouse" })]);
    expect(press).toBeNull();
    expect(commands).toEqual([]);
  });

  it("leaves an in-flight press alone when a second finger lands", () => {
    const { press } = run([touchDown(), touchDown({ pointerId: 2, isPrimary: false })]);
    expect(press).toMatchObject({ pointerId: POINTER_ID, fired: false });
  });

  it("fires at the last in-slop position, offset downward", () => {
    const { press, commands } = run([
      touchDown(),
      { kind: "move", pointerId: POINTER_ID, x: 104, y: 206 },
      { kind: "timeout" },
    ]);
    expect(commands).toEqual([
      { kind: "fire", position: { x: 104, y: 206 + LONG_PRESS_MENU_OFFSET_Y } },
    ]);
    expect(press).toMatchObject({ fired: true });
  });

  it("cancels when the finger moves past the slop", () => {
    const { press, commands } = run([
      touchDown(),
      { kind: "move", pointerId: POINTER_ID, x: 100, y: 211 },
    ]);
    expect(kinds(commands)).toEqual(["disarm"]);
    expect(press).toBeNull();
  });

  it("cancels on scroll before it fires", () => {
    const { press, commands } = run([touchDown(), { kind: "scroll" }]);
    expect(kinds(commands)).toEqual(["disarm"]);
    expect(press).toBeNull();
  });

  it("ignores scroll once the menu is open", () => {
    const { press, commands } = run([touchDown(), { kind: "timeout" }, { kind: "scroll" }]);
    expect(commands).toEqual([]);
    expect(press).toMatchObject({ fired: true });
  });

  it("does not fire twice", () => {
    const { commands } = run([touchDown(), { kind: "timeout" }, { kind: "timeout" }]);
    expect(commands).toEqual([]);
  });

  it("suppresses the ghost click only when the menu opened", () => {
    const afterFire = run([
      touchDown(),
      { kind: "timeout" },
      { kind: "up", pointerId: POINTER_ID },
    ]);
    expect(kinds(afterFire.commands)).toEqual(["disarm", "suppress-click"]);
    expect(afterFire.press).toBeNull();

    const earlyLift = run([touchDown(), { kind: "up", pointerId: POINTER_ID }]);
    expect(kinds(earlyLift.commands)).toEqual(["disarm"]);
  });

  it("never suppresses after a cancelled pointer", () => {
    const { press, commands } = run([
      touchDown(),
      { kind: "timeout" },
      { kind: "cancel", pointerId: POINTER_ID },
    ]);
    expect(kinds(commands)).toEqual(["disarm"]);
    expect(press).toBeNull();
  });

  it("ignores events from a pointer it is not tracking", () => {
    const { press, commands } = run([
      touchDown(),
      { kind: "move", pointerId: 99, x: 900, y: 900 },
      { kind: "up", pointerId: 99 },
    ]);
    expect(commands).toEqual([]);
    expect(press).toMatchObject({ pointerId: POINTER_ID, x: 100, y: 200 });
  });

  it("ignores stray events while idle", () => {
    expect(run([{ kind: "timeout" }]).commands).toEqual([]);
    expect(run([{ kind: "scroll" }]).commands).toEqual([]);
    expect(run([{ kind: "up", pointerId: POINTER_ID }]).commands).toEqual([]);
  });
});
