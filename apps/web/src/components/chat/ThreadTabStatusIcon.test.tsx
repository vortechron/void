import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadTabStatusIcon } from "./ThreadTabStatusIcon";

describe("ThreadTabStatusIcon", () => {
  it("renders the Loading UI diamond for working tabs", () => {
    const markup = renderToStaticMarkup(<ThreadTabStatusIcon status="working" />);

    expect(markup).toContain('aria-label="Working"');
    expect(markup.match(/<rect/g)).toHaveLength(8);
    expect(markup).toContain("spin-pixel");
  });

  it.each([
    ["approval", "Approval needed"],
    ["input", "Awaiting input"],
    ["failed", "Failed"],
    ["plan", "Plan ready"],
    ["completed", "Completed"],
  ] as const)("renders the %s state before the tab title", (status, label) => {
    const markup = renderToStaticMarkup(<ThreadTabStatusIcon status={status} />);

    expect(markup).toContain(`aria-label="${label}"`);
  });

  it("keeps idle tab titles clear", () => {
    expect(renderToStaticMarkup(<ThreadTabStatusIcon status="ready" />)).toBe("");
  });
});
