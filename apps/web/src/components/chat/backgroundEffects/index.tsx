import type { ChatBackgroundEffect, ChatBorderEffect } from "@t3tools/contracts/settings";
import type { ReactElement } from "react";

import { useMediaQuery } from "~/hooks/useMediaQuery";
import { cn } from "~/lib/utils";
import type { MeteorFieldConfig } from "./meteorField";
import { MeteorsEffect } from "./MeteorsEffect";
import { RippleEffect } from "./RippleEffect";
import type { RippleFieldConfig } from "./rippleField";

/**
 * Ambient effects drawn on the new-thread hero.
 *
 * Two independent settings, because they decorate two different surfaces: the
 * background fills the chat column behind the hero, the border traces the
 * composer's own box. They are not alternatives, so each has its own registry
 * and its own picker, and both can be on at once.
 *
 * One place adds an effect: a value in the matching contract type, a label
 * here, and a definition here. Each record is keyed by its contract type, so a
 * new value fails to typecheck until it has a label and something to draw.
 */

const METEORS_CONFIG: MeteorFieldConfig = {
  count: 18,
  // Down and to the left, matching the diagonal the hero headline sits on.
  angleDegrees: 145,
  travelPx: 900,
  tailPx: 56,
  minDelaySeconds: 0,
  maxDelaySeconds: 6,
  minDurationSeconds: 5,
  maxDurationSeconds: 12,
  seed: 0x7e3c,
};

/**
 * `boxRadiusPx` tracks the composer's own 22px corner, and the offsets are
 * kept under ~140px total so the aura still has room to fade out inside the
 * chat column on a narrow window.
 */
const RIPPLE_CONFIG: RippleFieldConfig = {
  count: 5,
  baseInsetPx: 14,
  insetStepPx: 26,
  boxRadiusPx: 22,
  baseOpacity: 0.22,
  opacityStep: 0.04,
  minOpacity: 0.02,
  // Slower than magicui's 2s default: this frames a text field someone is
  // about to type in, so it should read as breathing rather than pulsing.
  durationSeconds: 3.2,
  delayStepSeconds: 0.16,
};

type EffectRenderer = () => ReactElement;

const BACKGROUND_RENDERERS: Readonly<
  Record<Exclude<ChatBackgroundEffect, "none">, EffectRenderer>
> = {
  meteors: () => <MeteorsEffect config={METEORS_CONFIG} />,
};

const BORDER_RENDERERS: Readonly<Record<Exclude<ChatBorderEffect, "none">, EffectRenderer>> = {
  ripple: () => <RippleEffect config={RIPPLE_CONFIG} />,
};

export const CHAT_BACKGROUND_EFFECT_LABELS: Readonly<Record<ChatBackgroundEffect, string>> = {
  none: "None",
  meteors: "Meteors",
};

export const CHAT_BORDER_EFFECT_LABELS: Readonly<Record<ChatBorderEffect, string>> = {
  none: "None",
  ripple: "Ripple",
};

function toOptions<T extends string>(
  labels: Readonly<Record<T, string>>,
): ReadonlyArray<{ readonly value: T; readonly label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

export const CHAT_BACKGROUND_EFFECT_OPTIONS = toOptions(CHAT_BACKGROUND_EFFECT_LABELS);
export const CHAT_BORDER_EFFECT_OPTIONS = toOptions(CHAT_BORDER_EFFECT_LABELS);

/**
 * A background effect is clipped to the chat area so nothing bleeds into the
 * sidebar; a border effect has to escape the composer's box to be visible at
 * all, since every ring it draws sits outside it.
 */
const BACKGROUND_LAYER_CLASS_NAME = "pointer-events-none absolute inset-0 overflow-hidden";
const BORDER_LAYER_CLASS_NAME = "chat-composer-effect-layer pointer-events-none absolute inset-0";

/**
 * Whether an ambient effect should draw at all right now. Reduced motion turns
 * every one of them off; callers are additionally expected to mount them only
 * while the surface they decorate is idle, so nothing animates around live
 * work.
 */
function useEffectLayerEnabled(effect: string): boolean {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return effect !== "none" && !prefersReducedMotion;
}

interface EffectLayerProps<T extends string> {
  readonly effect: T;
  readonly className?: string;
}

/**
 * Renders the selected background effect as a non-interactive layer sized to
 * its positioned parent, which is expected to be the chat column.
 */
export function ChatBackgroundEffectLayer({
  effect,
  className,
}: EffectLayerProps<ChatBackgroundEffect>) {
  const enabled = useEffectLayerEnabled(effect);
  // A value written by a newer build decodes to the default, but a stale
  // in-memory snapshot could still name an effect this build cannot draw.
  const render = effect === "none" ? undefined : BACKGROUND_RENDERERS[effect];
  if (!enabled || !render) {
    return null;
  }

  return (
    <div
      className={cn(BACKGROUND_LAYER_CLASS_NAME, className)}
      data-chat-background-effect={effect}
    >
      {render()}
    </div>
  );
}

/**
 * Renders the selected border effect as a non-interactive layer sized to its
 * positioned parent, which is expected to be the composer's glass shell.
 */
export function ChatBorderEffectLayer({ effect, className }: EffectLayerProps<ChatBorderEffect>) {
  const enabled = useEffectLayerEnabled(effect);
  const render = effect === "none" ? undefined : BORDER_RENDERERS[effect];
  if (!enabled || !render) {
    return null;
  }

  return (
    <div className={cn(BORDER_LAYER_CLASS_NAME, className)} data-chat-border-effect={effect}>
      {render()}
    </div>
  );
}
