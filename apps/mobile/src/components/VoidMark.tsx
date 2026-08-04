import type { ColorValue } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

/** The Void brand mark, matching the desktop sidebar lockup. */
export function VoidMark(props: { readonly height: number; readonly color: ColorValue }) {
  return (
    <Svg accessibilityLabel="Void" height={props.height} width={props.height} viewBox="0 0 24 24">
      <Rect
        x={1.5}
        y={1.5}
        width={21}
        height={21}
        rx={4}
        fill="none"
        stroke={props.color}
        strokeWidth={2}
      />
      <Path
        d="m6 7 4.25 10h3.5L18 7"
        fill="none"
        stroke={props.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
      />
    </Svg>
  );
}
