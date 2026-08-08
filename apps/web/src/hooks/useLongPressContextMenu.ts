import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  LONG_PRESS_CLICK_SUPPRESS_MS,
  LONG_PRESS_DELAY_MS,
  type LongPressCommand,
  type LongPressInput,
  type LongPressPress,
  reduceLongPress,
} from "../lib/longPress";

export interface LongPressContextMenuHandlers {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface UseLongPressContextMenuOptions {
  readonly disabled?: boolean | undefined;
  readonly slopPx?: number | undefined;
  readonly delayMs?: number | undefined;
}

/**
 * Suppresses the iOS callout (magnifier, copy, share) on the press target only.
 * Inline rather than a utility class so it survives elements whose `className`
 * is owned by a parent through a Base UI `render` prop.
 *
 * Deliberately does not set `touch-action`. The sidebar and tab strip are plain
 * overflow viewports, so a drag pans them and fires `pointercancel`, which
 * cancels the press for free. `pan-y` would gain nothing and kill pinch-zoom;
 * `none` would kill scrolling outright.
 */
export const LONG_PRESS_TARGET_STYLE = { WebkitTouchCallout: "none" } as const;

/**
 * Swallows the compatibility click iOS synthesises when the finger lifts, so a
 * long press does not also activate the row or tab underneath it.
 *
 * Registered on `window` in the capture phase: React delegates to the root
 * container, a descendant of `window`, so stopping propagation here kills the
 * React `onClick` before it runs. Only `click` is suppressed — swallowing
 * `mousedown` too would break popups that dismiss on it.
 */
function suppressNextClick(): void {
  if (typeof window === "undefined") return;
  let timeoutId = 0;
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.clearTimeout(timeoutId);
  };
  window.addEventListener("click", onClick, { capture: true, once: true });
  // The finger can rest on the row for seconds after the menu opens, so the
  // window is armed at lift rather than at fire time; this only bounds how long
  // a never-arriving ghost click can linger.
  timeoutId = window.setTimeout(
    () => window.removeEventListener("click", onClick, true),
    LONG_PRESS_CLICK_SUPPRESS_MS,
  );
}

/**
 * Opens a context menu from a touch long-press.
 *
 * iOS/iPadOS Safari never dispatches `contextmenu` from a long press, so an
 * `onContextMenu` handler alone is unreachable on an iPad. This supplies the
 * missing gesture and leaves mouse input completely alone — the reducer only
 * arms for `pointerType` "touch" or "pen".
 *
 * Spread the returned handlers onto the same element that carries
 * `onContextMenu`, alongside {@link LONG_PRESS_TARGET_STYLE}.
 */
export function useLongPressContextMenu(
  onLongPress: (position: { readonly x: number; readonly y: number }) => void,
  options?: UseLongPressContextMenuOptions,
): LongPressContextMenuHandlers {
  const disabled = options?.disabled ?? false;

  const pressRef = useRef<LongPressPress>(null);
  const timeoutIdRef = useRef<number | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);
  const dispatchRef = useRef<((input: LongPressInput) => void) | null>(null);

  // Read through refs so the handler bag stays referentially stable — these
  // elements are inside memoised list rows rendered hundreds at a time.
  const onLongPressRef = useRef(onLongPress);
  const slopPxRef = useRef(options?.slopPx);
  const delayMsRef = useRef(options?.delayMs);
  useEffect(() => {
    onLongPressRef.current = onLongPress;
    slopPxRef.current = options?.slopPx;
    delayMsRef.current = options?.delayMs;
  });

  const disarm = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    if (scrollListenerRef.current !== null) {
      window.removeEventListener("scroll", scrollListenerRef.current, true);
      scrollListenerRef.current = null;
    }
  }, []);

  const runCommand = useCallback(
    (command: LongPressCommand) => {
      switch (command.kind) {
        case "arm": {
          // Idempotent by contract: clear anything already in flight first.
          disarm();
          const onScroll = () => dispatchRef.current?.({ kind: "scroll" });
          scrollListenerRef.current = onScroll;
          // `scroll` does not bubble but does capture, so a capture-phase
          // listener on window sees scrolling from any nested scroller. Belt
          // and braces alongside `pointercancel`, which iOS already fires once
          // a scroll container starts panning.
          window.addEventListener("scroll", onScroll, { capture: true, passive: true });
          timeoutIdRef.current = window.setTimeout(
            () => dispatchRef.current?.({ kind: "timeout" }),
            delayMsRef.current ?? LONG_PRESS_DELAY_MS,
          );
          break;
        }
        case "disarm":
          disarm();
          break;
        case "fire":
          onLongPressRef.current(command.position);
          break;
        case "suppress-click":
          suppressNextClick();
          break;
      }
    },
    [disarm],
  );

  const dispatch = useCallback(
    (input: LongPressInput) => {
      const result = reduceLongPress(pressRef.current, input, { slopPx: slopPxRef.current });
      pressRef.current = result.press;
      for (const command of result.commands) {
        runCommand(command);
      }
    },
    [runCommand],
  );

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    if (!disabled) return;
    pressRef.current = null;
    disarm();
  }, [disabled, disarm]);

  useEffect(() => () => disarm(), [disarm]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled) return;
      dispatch({
        kind: "down",
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [disabled, dispatch],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      dispatch({ kind: "move", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    },
    [dispatch],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      dispatch({ kind: "up", pointerId: event.pointerId });
    },
    [dispatch],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      dispatch({ kind: "cancel", pointerId: event.pointerId });
    },
    [dispatch],
  );

  return useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel }),
    [onPointerCancel, onPointerDown, onPointerMove, onPointerUp],
  );
}
