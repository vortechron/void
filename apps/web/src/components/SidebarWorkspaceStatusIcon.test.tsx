import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SidebarWorkspaceStatusIcon } from "./SidebarWorkspaceStatusIcon";

describe("SidebarWorkspaceStatusIcon", () => {
  it("renders the pixel-grid loader for a working workspace", () => {
    const markup = renderToStaticMarkup(<SidebarWorkspaceStatusIcon status="working" />);

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
    ["ready", "Ready"],
  ] as const)("renders an accessible %s state", (status, label) => {
    const markup = renderToStaticMarkup(<SidebarWorkspaceStatusIcon status={status} />);

    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).not.toContain("animate-spin");
  });
});
