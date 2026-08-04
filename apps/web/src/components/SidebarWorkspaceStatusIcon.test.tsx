import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SidebarWorkspaceStatusIcon } from "./SidebarWorkspaceStatusIcon";

describe("SidebarWorkspaceStatusIcon", () => {
  it("renders the Loading UI diamond for a working workspace", () => {
    const markup = renderToStaticMarkup(<SidebarWorkspaceStatusIcon status="working" />);

    expect(markup).toContain('aria-label="Working"');
    expect(markup.match(/<rect/g)).toHaveLength(8);
    expect(markup).toContain("spin-pixel");
  });

  it.each([
    ["approval", "Approval needed"],
    ["input", "Awaiting input"],
    ["failed", "Failed"],
    ["ready", "Ready"],
  ] as const)("renders an accessible %s state", (status, label) => {
    const markup = renderToStaticMarkup(<SidebarWorkspaceStatusIcon status={status} />);

    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).not.toContain("animate-spin");
  });
});
