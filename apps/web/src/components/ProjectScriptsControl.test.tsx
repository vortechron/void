import type { ProjectScript, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import ProjectScriptsControl from "./ProjectScriptsControl";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const PRIMARY_SCRIPT: ProjectScript = {
  id: "dev",
  name: "Dev",
  command: "vp dev",
  icon: "play",
  runOnWorktreeCreate: false,
};

function renderControl(
  scripts: ReadonlyArray<ProjectScript>,
  globalScripts: ReadonlyArray<ProjectScript> = [],
) {
  return renderToStaticMarkup(
    <ProjectScriptsControl
      scripts={scripts}
      globalScripts={globalScripts}
      globalActionsSupported={globalScripts.length > 0}
      keybindings={EMPTY_KEYBINDINGS}
      onRunScript={() => {}}
      onAddScript={async () => undefined as never}
      onUpdateScript={async () => undefined as never}
      onDeleteScript={async () => undefined as never}
    />,
  );
}

function buttonTag(html: string, ariaLabel: string) {
  return html.match(new RegExp(`<button[^>]*aria-label="${ariaLabel}"[^>]*>`))?.[0];
}

function expectResponsiveXsControl(markup: string | undefined) {
  expect(markup).toBeDefined();
  expect(markup).toContain("h-7");
  expect(markup).toContain("gap-1");
  expect(markup).toContain("text-sm");
  expect(markup).toContain("sm:h-6");
  expect(markup).toContain("sm:text-xs");
  expect(markup).toContain("w-7");
  expect(markup).toContain("px-0");
  expect(markup).toContain("sm:w-6");
  expect(markup).toContain("@3xl/header-actions:w-auto!");
  expect(markup).toContain("@3xl/header-actions:px-[calc(--spacing(2)-1px)]");
}

describe("ProjectScriptsControl compact controls", () => {
  it("keeps the primary Run control compact and expands it with its label", () => {
    const html = renderControl([PRIMARY_SCRIPT]);

    expectResponsiveXsControl(buttonTag(html, "Run Dev"));
    expect(html).toContain(
      'class="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5"',
    );
  });

  it("keeps the standalone Add control compact and expands it with its label", () => {
    const html = renderControl([]);

    expectResponsiveXsControl(buttonTag(html, "Add action"));
    expect(html).toContain(
      'class="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5"',
    );
  });
});

describe("ProjectScriptsControl action scopes", () => {
  const GLOBAL_SCRIPT: ProjectScript = {
    id: "install",
    name: "Install",
    command: "pnpm install",
    icon: "configure",
    runOnWorktreeCreate: false,
  };

  it("promotes a global script to the primary Run control when the project has none", () => {
    const html = renderControl([], [GLOBAL_SCRIPT]);

    expect(buttonTag(html, "Run Install")).toBeDefined();
    expect(buttonTag(html, "Add action")).toBeUndefined();
  });

  it("keeps the project's own script primary when both scopes have one", () => {
    const html = renderControl([PRIMARY_SCRIPT], [GLOBAL_SCRIPT]);

    expect(buttonTag(html, "Run Dev")).toBeDefined();
    expect(buttonTag(html, "Run Install")).toBeUndefined();
  });
});
