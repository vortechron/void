import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadTabStatusIcon } from "./ThreadTabStatusIcon";

describe("ThreadTabStatusIcon", () => {
  it("renders the pixel-grid loader for working tabs", () => {
    const markup = renderToStaticMarkup(<ThreadTabStatusIcon status="working" />);

    expect(markup).toContain('aria-label="Working"');
    expect(markup).toContain('role="status"');
    // Nine cells drive the wavefront; the centre column is what reads as motion.
    expect(markup.match(/pixel-on/g)).toHaveLength(9);
  });

  it.each([
    ["approval", "Approval needed"],
    ["input", "Awaiting input"],
    ["failed", "Failed"],
    ["plan", "Plan ready"],
    ["completed", "Completed"],
    ["monitoring", "Monitoring"],
  ] as const)("renders the %s state before the tab title", (status, label) => {
    const markup = renderToStaticMarkup(<ThreadTabStatusIcon status={status} />);

    expect(markup).toContain(`aria-label="${label}"`);
  });

  it("keeps idle tab titles clear", () => {
    expect(renderToStaticMarkup(<ThreadTabStatusIcon status="ready" />)).toBe("");
  });
});
