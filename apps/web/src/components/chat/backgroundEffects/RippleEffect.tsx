import type { CSSProperties } from "react";
import { useMemo } from "react";

import { buildRippleField, type RippleFieldConfig } from "./rippleField";

export interface RippleEffectProps {
  readonly config: RippleFieldConfig;
}

/**
 * An aura of nested rounded rectangles breathing outward from the composer,
 * after magicui's `Ripple` but tracing the box instead of drawing circles.
 * Each ring is one CSS animation over `transform` only, so the whole field
 * stays on the compositor no matter how many rings the config asks for.
 *
 * Sizes itself from its positioned parent, which is expected to be the
 * composer shell, so nothing here has to measure the box.
 */
export function RippleEffect({ config }: RippleEffectProps) {
  const field = useMemo(() => buildRippleField(config), [config]);

  return (
    <div
      aria-hidden="true"
      className="chat-ripple-field"
      style={{ "--ripple-duration": `${field.durationSeconds}s` } as CSSProperties}
    >
      {field.rings.map((ring) => (
        <span
          key={ring.key}
          className="chat-ripple-ring"
          style={
            {
              inset: `${-ring.insetPx}px`,
              borderRadius: `${ring.borderRadiusPx}px`,
              opacity: ring.opacity,
              "--ripple-delay": `${ring.delaySeconds}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
