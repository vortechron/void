import type { CSSProperties } from "react";
import { useMemo } from "react";

import { buildMeteorField, type MeteorFieldConfig } from "./meteorField";

export interface MeteorsEffectProps {
  readonly config: MeteorFieldConfig;
}

/**
 * A meteor shower, after magicui's `Meteors`, scoped to its own layer instead
 * of the viewport. Every meteor is one CSS animation over `transform` and
 * `opacity` only, so the whole field stays on the compositor.
 */
export function MeteorsEffect({ config }: MeteorsEffectProps) {
  const field = useMemo(() => buildMeteorField(config), [config]);

  return (
    <div
      aria-hidden="true"
      className="chat-meteor-field"
      style={
        {
          "--meteor-travel-x": `${field.travelXPx}px`,
          "--meteor-travel-y": `${field.travelYPx}px`,
          "--meteor-tilt": `${field.angleDegrees}deg`,
          "--meteor-tail-length": `${field.tailPx}px`,
        } as CSSProperties
      }
    >
      {field.meteors.map((meteor) => (
        <span
          key={meteor.key}
          className="chat-meteor"
          style={
            {
              left: `${meteor.leftPercent}%`,
              top: `${meteor.topPercent}%`,
              "--meteor-delay": `${meteor.delaySeconds}s`,
              "--meteor-duration": `${meteor.durationSeconds}s`,
            } as CSSProperties
          }
        >
          <span className="chat-meteor-tail" />
        </span>
      ))}
    </div>
  );
}
