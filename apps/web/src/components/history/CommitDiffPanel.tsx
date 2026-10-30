/**
 * Diff surface for a single commit, opened from the history graph.
 *
 * This is deliberately not the thread review panel: there is no turn timeline,
 * no working-tree/branch toggle, and no comparison target picker. One commit,
 * its patch against its first parent, and the same renderer the review panel
 * uses so the diff reads identically wherever it appears.
 */
import type { FileDiffContentsLoader, FileDiffMetadata } from "@pierre/diffs";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";

import type { DraftId } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { useTheme } from "~/hooks/useTheme";
import { DIFF_PANEL_UNSAFE_CSS } from "~/lib/diffPanelCss";
import {
  buildFileDiffContentVersion,
  getRenderablePatch,
  resolveDiffThemeName,
  resolveDiffThemeType,
  resolveFileDiffPath,
} from "~/lib/diffRendering";
import { useEnvironmentQuery } from "~/state/query";
import { reviewEnvironment } from "~/state/review";
import { useAtomCommand } from "~/state/use-atom-command";
import { AnnotatableCodeView } from "~/components/diffs/AnnotatableCodeView";
import { DiffFilePathCopyButton } from "~/components/DiffFilePathCopyButton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

const noop = () => {};
// A commit patch arrives whole, so no file is ever a lazy placeholder.
const NO_PENDING_FILES: ReadonlyArray<FileDiffMetadata> = [];

export function CommitDiffPanel({
  environmentId,
  cwd,
  sha,
  shortSha,
  subject,
  composerDraftTarget,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  sha: string;
  shortSha: string;
  subject: string;
  composerDraftTarget: ScopedThreadRef | DraftId;
}) {
  const settings = useClientSettings();
  const { resolvedTheme } = useTheme();
  const getDiffFileContents = useAtomCommand(reviewEnvironment.diffFileContents);

  const preview = useEnvironmentQuery(
    reviewEnvironment.diffPreview({ environmentId, input: { cwd, commitSha: sha } }),
  );
  const source = preview.data?.sources.find((entry) => entry.kind === "commit") ?? null;

  const renderablePatch = useMemo(
    () =>
      getRenderablePatch(source?.diff, `commit-diff:${resolvedTheme}:${settings.codeTheme}`, {
        compactPartialHunkOffsets: true,
      }),
    [resolvedTheme, settings.codeTheme, source?.diff],
  );

  const loadDiffFiles = useMemo<FileDiffContentsLoader | undefined>(() => {
    const previewData = preview.data;
    if (!previewData || !source) return undefined;

    return async (fileDiff) => {
      const newPath = resolveFileDiffPath(fileDiff);
      const oldPath = fileDiff.prevName
        ? resolveFileDiffPath({ ...fileDiff, name: fileDiff.prevName })
        : newPath;
      const result = await getDiffFileContents({
        environmentId,
        input: {
          cwd: previewData.cwd,
          sourceKind: source.kind,
          changeType: fileDiff.type,
          baseRef: source.baseRef,
          headRef: source.headRef,
          oldPath,
          newPath,
        },
      });
      if (result._tag !== "Success") throw squashAtomCommandFailure(result);

      const newFile = {
        name: newPath,
        contents: result.value.newContents,
        cacheKey: `${source.diffHash}:new:${newPath}`,
      };
      if (fileDiff.type === "rename-pure") return { oldFile: null, newFile };
      return {
        oldFile: {
          name: oldPath,
          contents: result.value.oldContents,
          cacheKey: `${source.diffHash}:old:${oldPath}`,
        },
        newFile,
      };
    };
  }, [environmentId, getDiffFileContents, preview.data, source]);

  const codeViewFiles = useMemo(
    () =>
      renderablePatch?.kind === "files"
        ? renderablePatch.files.map((fileDiff) => {
            const filePath = resolveFileDiffPath(fileDiff);
            return {
              fileDiff,
              filePath,
              fileKey: filePath,
              fileVersion: buildFileDiffContentVersion(fileDiff),
              collapsed: false,
            };
          })
        : [],
    [renderablePatch],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{shortSha}</span>
        <Tooltip>
          <TooltipTrigger
            render={<span className="min-w-0 flex-1 truncate text-xs">{subject}</span>}
          />
          <TooltipPopup side="bottom" className="max-w-80">
            {subject}
          </TooltipPopup>
        </Tooltip>
        {source?.truncated ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">truncated</span>
        ) : null}
      </div>

      {preview.error && !renderablePatch ? (
        <p className="px-3 py-2 text-xs text-destructive-foreground/80">{preview.error}</p>
      ) : null}

      {!renderablePatch ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-xs text-muted-foreground/70">
          {preview.isPending ? "Loading commit diff..." : "This commit changed no files."}
        </div>
      ) : renderablePatch.kind === "files" ? (
        <AnnotatableCodeView
          codeViewKey={`commit:${sha}`}
          className="diff-render-surface min-h-0 flex-1 overflow-auto"
          files={codeViewFiles}
          pendingFiles={NO_PENDING_FILES}
          sectionId={`commit:${sha}`}
          sectionTitle={subject}
          composerDraftTarget={composerDraftTarget}
          // Commit files never fold, so a find match is already visible.
          onRevealSearchMatch={noop}
          renderHeaderFilenameSuffix={(fileDiff) => (
            <DiffFilePathCopyButton filePath={resolveFileDiffPath(fileDiff)} />
          )}
          renderHeaderPrefix={(fileDiff, _fileKey, collapsed) => {
            const filePath = resolveFileDiffPath(fileDiff);
            return (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground/80"
                      aria-label={filePath}
                    />
                  }
                >
                  {collapsed ? (
                    <ChevronRightIcon className="size-4" />
                  ) : (
                    <ChevronDownIcon className="size-4" />
                  )}
                </TooltipTrigger>
                <TooltipPopup side="top">{filePath}</TooltipPopup>
              </Tooltip>
            );
          }}
          // Item metrics and layout now live in StyledDiffCodeView, which sets
          // the same values plus the scroll-height correction.
          unsafeCSSExtra={DIFF_PANEL_UNSAFE_CSS}
          options={{
            diffStyle: "unified",
            lineDiffType: "none",
            overflow: settings.wordWrap ? "wrap" : "scroll",
            theme: resolveDiffThemeName(resolvedTheme, settings.codeTheme),
            themeType: resolveDiffThemeType(resolvedTheme, settings.codeTheme),
            stickyHeaders: true,
            ...(loadDiffFiles ? { loadDiffFiles } : {}),
          }}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <p className="mb-2 text-[11px] text-muted-foreground/75">{renderablePatch.reason}</p>
          <pre className="overflow-auto rounded-md border border-border/70 bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90">
            {renderablePatch.text}
          </pre>
        </div>
      )}
    </div>
  );
}

export default CommitDiffPanel;
