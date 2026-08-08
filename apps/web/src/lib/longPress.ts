/**
 * Long-press gesture state machine for opening context menus by touch.
 *
 * iOS/iPadOS Safari does not dispatch `contextmenu` from a touch long-press —
 * it shows the native callout instead — so every `onContextMenu` handler in the
 * app is unreachable on an iPad. This models the missing gesture as a pure
 * reducer: the caller feeds it pointer events and executes the commands it
 * returns. Keeping it DOM-free is deliberate, because the web unit test project
 * runs without a DOM environment.
 *
 * The constants mirror Base UI's own `ContextMenuTrigger` so a long press here
 * feels identical to the one Base UI primitive already used in the app.
 */

export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_SLOP_PX = 10;
export const LONG_PRESS_CLICK_SUPPRESS_MS = 400;

/**
 * The menu renderer anchors its top-left corner on the reported point, so
 * without a nudge the first row would sit directly under the fingertip.
 */
export const LONG_PRESS_MENU_OFFSET_Y = 8;

export type LongPressPress = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly fired: boolean;
} | null;

export type LongPressInput =
  | {
      readonly kind: "down";
      readonly pointerId: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;
      readonly button: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: "move"; readonly pointerId: number; readonly x: number; readonly y: number }
  | { readonly kind: "up"; readonly pointerId: number }
  | { readonly kind: "cancel"; readonly pointerId: number }
  | { readonly kind: "scroll" }
  | { readonly kind: "timeout" };

export type LongPressCommand =
  /** Start the hold timer and the scroll watcher. Implementations must treat this as idempotent. */
  | { readonly kind: "arm" }
  /** Clear the hold timer and the scroll watcher. */
  | { readonly kind: "disarm" }
  | { readonly kind: "fire"; readonly position: { readonly x: number; readonly y: number } }
  /** Swallow the compatibility click iOS synthesises when the finger lifts. */
  | { readonly kind: "suppress-click" };

export type LongPressResult = {
  readonly press: LongPressPress;
  readonly commands: readonly LongPressCommand[];
};

const NO_COMMANDS: readonly LongPressCommand[] = [];

/**
 * Only touch and pen arm the gesture. Mouse and trackpad keep using the native
 * `contextmenu` event, so desktop behaviour is untouched. This reads the
 * per-event `pointerType` rather than a `(pointer: coarse)` media query on
 * purpose: an iPad with a Magic Keyboard trackpad reports a fine pointer and
 * still sends touch events, which a media query would get wrong.
 */
export function shouldArmLongPress(input: {
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly button: number;
}): boolean {
  if (input.pointerType !== "touch" && input.pointerType !== "pen") return false;
  if (!input.isPrimary) return false;
  return input.button === 0;
}

/** Per-axis, matching Base UI, rather than a radial distance. */
export function hasExceededLongPressSlop(input: {
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly slopPx?: number | undefined;
}): boolean {
  const slop = input.slopPx ?? LONG_PRESS_MOVE_SLOP_PX;
  return Math.abs(input.x - input.startX) > slop || Math.abs(input.y - input.startY) > slop;
}

export function resolveLongPressMenuPosition(input: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
} {
  return { x: input.x, y: input.y + LONG_PRESS_MENU_OFFSET_Y };
}

function isForeignPointer(press: LongPressPress, pointerId: number): press is null {
  return press === null || press.pointerId !== pointerId;
}

export function reduceLongPress(
  press: LongPressPress,
  input: LongPressInput,
  options?: { readonly slopPx?: number | undefined },
): LongPressResult {
  switch (input.kind) {
    case "down": {
      if (
        !shouldArmLongPress({
          pointerType: input.pointerType,
          isPrimary: input.isPrimary,
          button: input.button,
        })
      ) {
        // A mouse press, or a second finger landing mid-gesture. Leave any
        // press already in flight alone — iOS sends `pointercancel` when a
        // second finger turns the interaction into a pinch.
        return { press, commands: NO_COMMANDS };
      }
      return {
        press: {
          pointerId: input.pointerId,
          startX: input.x,
          startY: input.y,
          x: input.x,
          y: input.y,
          fired: false,
        },
        commands: [{ kind: "arm" }],
      };
    }

    case "move": {
      if (isForeignPointer(press, input.pointerId)) return { press, commands: NO_COMMANDS };
      if (press.fired) return { press, commands: NO_COMMANDS };
      if (
        hasExceededLongPressSlop({
          startX: press.startX,
          startY: press.startY,
          x: input.x,
          y: input.y,
          slopPx: options?.slopPx,
        })
      ) {
        return { press: null, commands: [{ kind: "disarm" }] };
      }
      // Track the finger so the menu opens where it currently rests, the way a
      // native `contextmenu` reports live `clientX`/`clientY`.
      return { press: { ...press, x: input.x, y: input.y }, commands: NO_COMMANDS };
    }

    case "up": {
      if (isForeignPointer(press, input.pointerId)) return { press, commands: NO_COMMANDS };
      return {
        press: null,
        commands: press.fired
          ? [{ kind: "disarm" }, { kind: "suppress-click" }]
          : [{ kind: "disarm" }],
      };
    }

    case "cancel": {
      if (isForeignPointer(press, input.pointerId)) return { press, commands: NO_COMMANDS };
      // No compatibility click follows a cancelled pointer, so never suppress.
      return { press: null, commands: [{ kind: "disarm" }] };
    }

    case "scroll": {
      if (press === null || press.fired) return { press, commands: NO_COMMANDS };
      return { press: null, commands: [{ kind: "disarm" }] };
    }

    case "timeout": {
      if (press === null || press.fired) return { press, commands: NO_COMMANDS };
      // Stay armed so the following `up` knows to suppress its ghost click.
      return {
        press: { ...press, fired: true },
        commands: [
          { kind: "fire", position: resolveLongPressMenuPosition({ x: press.x, y: press.y }) },
        ],
      };
    }
  }
}
