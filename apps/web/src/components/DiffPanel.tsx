import { useAtomValue } from "@effect/atom-react";
import type { FileDiffContentsLoader } from "@pierre/diffs";
import { useParams } from "@tanstack/react-router";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  getGitDiffRevision,
  shouldRefreshGitDiffPreview,
  type GitDiffRefreshSnapshot,
} from "@t3tools/client-runtime/state/review-diff-refresh";
import type { ScopedThreadRef, TurnId } from "@t3tools/contracts";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOpenInPreferredEditor } from "../editorPreferences";
import { type DraftId } from "../composerDraftStore";
import { openDiffFilePrimaryAction } from "../diffFileActions";
import { useCheckpointDiff } from "~/lib/checkpointDiffState";
import { cn } from "~/lib/utils";
import { selectThreadDiffPanelSelection, useDiffPanelStore } from "../diffPanelStore";
import { useTheme } from "../hooks/useTheme";
import {
  buildFileDiffRenderKey,
  getDiffCollapseIconClassName,
  getDiffLineStat,
  getFileDiffLineStat,
  getRenderablePatch,
  resolveDiffThemeName,
  resolveDiffThemeType,
  resolveFileDiffPath,
  DIFF_SURFACE_THEME_UNSAFE_CSS,
} from "../lib/diffRendering";
import type { DiffFileTreeEntry } from "../lib/diffFileTree";
import { areAllDiffFilesCollapsed, toggleAllDiffFiles } from "../lib/diffCollapse";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { useProject, useThread } from "../state/entities";
import { resolveThreadRouteRef } from "../threadRoutes";
import { useClientSettings } from "../hooks/useSettings";
import { formatShortTimestamp } from "../timestampFormat";
import { DiffPanelLoadingState, DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { DiffStatLabel } from "./chat/DiffStatLabel";
import { AnnotatableCodeView, type AnnotatableCodeViewHandle } from "./diffs/AnnotatableCodeView";
import { DiffBaseRefPicker } from "./diffs/DiffBaseRefPicker";
import { DiffFileTree } from "./diffs/DiffFileTree";
import { DiffToolbarActions } from "./diffs/DiffToolbarActions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { serverEnvironment } from "../state/server";
import { reviewEnvironment } from "../state/review";
import { vcsEnvironment } from "../state/vcs";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { buildBaseRefChoices } from "../lib/baseRefChoices";
import {
  DIFF_FILE_TREE_DEFAULT_WIDTH,
  DIFF_FILE_TREE_MIN_WIDTH,
  DIFF_FILE_TREE_WIDTH_STORAGE_KEY,
  getDiffFileTreeMaxWidth,
} from "../lib/diffFileTreeResize";

interface CollapsedDiffFilesState {
  readonly scopeKey: string | null;
  readonly fileKeys: ReadonlySet<string>;
}

interface RevealedDiffFileState {
  readonly scopeKey: string | null;
  readonly fileKey: string | null;
}

const EMPTY_COLLAPSED_DIFF_FILE_KEYS: ReadonlySet<string> = new Set();

const DIFF_PANEL_UNSAFE_CSS = `${DIFF_SURFACE_THEME_UNSAFE_CSS}
:is(
  [data-line],
  [data-line-annotation],
  [data-merge-conflict],
  [data-merge-conflict-actions],
  [data-no-newline]
)[data-selected-line] {
  --diffs-line-bg: light-dark(
    color-mix(
      in lab,
      var(--code-background) 88%,
      color-mix(in srgb, var(--code-background) 50%, var(--diffs-modified-base))
    ),
    color-mix(
      in lab,
      var(--code-background) 80%,
      color-mix(in srgb, var(--code-background) 70%, var(--diffs-modified-base))
    )
  ) !important;
}

:is([data-gutter-buffer], [data-column-number])[data-selected-line] {
  --diffs-line-bg: light-dark(
    color-mix(
      in lab,
      var(--code-background) 91%,
      color-mix(in srgb, var(--code-background) 35%, var(--diffs-modified-base))
    ),
    color-mix(
      in lab,
      var(--code-background) 85%,
      color-mix(in srgb, var(--code-background) 60%, var(--diffs-modified-base))
    )
  ) !important;
}

[data-indicators="bars"]
  :is([data-column-number], [data-gutter-buffer="annotation"])[data-selected-line] {
  position: relative;
}

[data-indicators="bars"]
  :is([data-column-number], [data-gutter-buffer="annotation"])[data-selected-line]::before {
  position: absolute !important;
  inset-block: 0 !important;
  inset-inline-start: 0 !important;
  display: block !important;
  width: 4px !important;
  min-width: 4px !important;
  max-width: 4px !important;
  height: auto !important;
  padding: 0 !important;
  content: "" !important;
  background-color: var(--diffs-modified-base) !important;
  background-image: none !important;
}

[data-file-info] {
  background-color: var(--code-background) !important;
  border-block-color: transparent !important;
  color: var(--code-foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: var(--code-background) !important;
  border-bottom-color: transparent !important;
  align-items: center !important;
  font-family: var(--font-sans) !important;
  font-size: 12px !important;
  line-height: 1 !important;
  min-height: 32px !important;
  padding-block: 6px !important;
  padding-inline: 8px 12px !important;
}

[data-diffs-header]:hover {
  background-color: color-mix(in srgb, var(--code-background) 97%, var(--code-foreground)) !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]) {
  height: 24px !important;
  margin-block: 0 !important;
  background-color: var(--code-background) !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-separator-wrapper] {
  padding-inline: 8px 12px !important;
  background-color: transparent !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-separator-content] {
  gap: 8px;
  padding-inline: 0 !important;
  background-color: transparent !important;
  color: color-mix(in srgb, var(--code-foreground) 52%, var(--code-background)) !important;
  font-family: var(--font-sans) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-unmodified-lines] {
  display: flex !important;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-unmodified-lines]::before,
:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-unmodified-lines]::after {
  width: auto;
  height: 1px;
  flex: 1 1 auto;
  content: "";
  background-color: color-mix(in srgb, var(--code-background) 92%, var(--code-foreground));
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])[data-expand-index]
  [data-separator-wrapper] {
  grid-template-columns: 0 minmax(0, 1fr) !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])[data-expand-index]
  [data-separator-content] {
  grid-column: 2 !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])
  [data-expand-button] {
  display: none !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]):has(
    [data-expand-button]
  )
  [data-separator-content] {
  cursor: pointer;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]):has(
    [data-expand-button]
  ):hover
  [data-separator-content] {
  color: color-mix(in srgb, var(--code-foreground) 76%, var(--code-background)) !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]):has(
    [data-expand-button]
  ):hover
  [data-unmodified-lines]::before,
:is([data-separator="line-info"], [data-separator="line-info-basic"]):has(
    [data-expand-button]
  ):hover
  [data-unmodified-lines]::after {
  background-color: color-mix(in srgb, var(--code-background) 84%, var(--code-foreground));
}

[data-diffs-header] [data-header-content] {
  align-items: center !important;
  line-height: 1 !important;
}

[data-diffs-header] [data-metadata] {
  align-items: center !important;
  line-height: 1 !important;
  font-variant-numeric: tabular-nums;
}

[data-diffs-header] [data-additions-count],
[data-diffs-header] [data-deletions-count] {
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  line-height: 1 !important;
}

[data-diffs-header] [data-change-icon],
[data-diffs-header] [data-rename-icon] {
  display: block;
  flex-shrink: 0;
}

[data-title] {
  cursor: pointer;
  transition:
    color 120ms ease,
    text-decoration-color 120ms ease;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 2px;
  font-family: var(--font-sans) !important;
}

[data-title]:hover {
  color: color-mix(in srgb, var(--code-foreground) 84%, var(--primary)) !important;
  text-decoration-color: currentColor;
}
`;
interface DiffPanelProps {
  mode?: DiffPanelMode;
  composerDraftTarget: ScopedThreadRef | DraftId;
  initialGitScope: "branch" | "unstaged";
}

export { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";

export default function DiffPanel({
  mode = "inline",
  composerDraftTarget,
  initialGitScope: initialGitScopeProp,
}: DiffPanelProps) {
  const { resolvedTheme } = useTheme();
  const settings = useClientSettings();
  const codeTheme = settings.codeTheme;
  const [initialGitScope] = useState(initialGitScopeProp);
  const diffRenderMode = useDiffPanelStore((state) => state.diffRenderMode);
  const setDiffRenderMode = useDiffPanelStore((state) => state.setDiffRenderMode);
  const [wordWrap, setWordWrap] = useState(settings.wordWrap);
  const [diffIgnoreWhitespace, setDiffIgnoreWhitespace] = useState(settings.diffIgnoreWhitespace);
  const [baseRefQuery, setBaseRefQuery] = useState("");
  const [collapsedDiffFiles, setCollapsedDiffFiles] = useState<CollapsedDiffFilesState>(() => ({
    scopeKey: null,
    fileKeys: EMPTY_COLLAPSED_DIFF_FILE_KEYS,
  }));
  const [revealedDiffFile, setRevealedDiffFile] = useState<RevealedDiffFileState>(() => ({
    scopeKey: null,
    fileKey: null,
  }));
  const [codeViewRevision, setCodeViewRevision] = useState(0);
  const codeViewRef = useRef<AnnotatableCodeViewHandle>(null);
  const diffFilesViewportRef = useRef<HTMLDivElement>(null);
  const [diffFilesViewportWidth, setDiffFilesViewportWidth] = useState<number | null>(null);
  const diffFileTreeMaxWidth = getDiffFileTreeMaxWidth(diffFilesViewportWidth);
  const { width: diffFileTreeWidth, handlers: diffFileTreeResizeHandlers } = useResizableWidth({
    storageKey: DIFF_FILE_TREE_WIDTH_STORAGE_KEY,
    defaultWidth: DIFF_FILE_TREE_DEFAULT_WIDTH,
    minWidth: DIFF_FILE_TREE_MIN_WIDTH,
    maxWidth: diffFileTreeMaxWidth,
    edge: "right",
  });
  // Below this width the right panel is a narrow sheet, so the toolbar and the
  // file tree have no room to sit side by side with the code.
  const isNarrow = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const persistedFileTreeVisible = useDiffPanelStore((state) => state.fileTreeVisible);
  // When narrow the tree is a full-panel overlay, so it must not restore itself
  // over the diff on every visit the way the docked wide column does.
  const [narrowFileTreeOpen, setNarrowFileTreeOpen] = useState(false);
  const fileTreeVisible = isNarrow ? narrowFileTreeOpen : persistedFileTreeVisible;
  const setFileTreeVisible = useCallback(
    (visible: boolean) => {
      if (isNarrow) {
        setNarrowFileTreeOpen(visible);
        return;
      }
      useDiffPanelStore.getState().setFileTreeVisible(visible);
    },
    [isNarrow],
  );
  const lastGitDiffRefreshSnapshotRef = useRef<GitDiffRefreshSnapshot | null>(null);

  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const activeThreadId = routeThreadRef?.threadId ?? null;
  const activeThread = useThread(routeThreadRef);
  const activeProjectId = activeThread?.projectId ?? null;
  const activeProject = useProject(
    activeThread && activeProjectId
      ? {
          environmentId: activeThread.environmentId,
          projectId: activeProjectId,
        }
      : null,
  );
  const activeCwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot;
  const serverConfig = useAtomValue(
    serverEnvironment.configValueAtom(activeThread?.environmentId ?? null),
  );
  const openInPreferredEditor = useOpenInPreferredEditor(
    activeThread?.environmentId ?? null,
    serverConfig?.availableEditors ?? [],
  );
  const getDiffFileContents = useAtomCommand(reviewEnvironment.diffFileContents);
  const gitStatusQuery = useEnvironmentQuery(
    activeThread !== null && activeThread !== undefined && activeCwd != null
      ? vcsEnvironment.status({
          environmentId: activeThread.environmentId,
          input: { cwd: activeCwd },
        })
      : null,
  );
  const diffSelection = useDiffPanelStore((state) =>
    selectThreadDiffPanelSelection(
      state.byThreadKey,
      routeThreadRef,
      initialGitScope === "unstaged",
    ),
  );
  const isGitRepo = gitStatusQuery.data?.isRepo ?? true;
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const orderedTurnDiffSummaries = useMemo(
    () =>
      [...turnDiffSummaries].toSorted((left, right) => {
        const leftTurnCount =
          left.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[left.turnId] ?? 0;
        const rightTurnCount =
          right.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[right.turnId] ?? 0;
        if (leftTurnCount !== rightTurnCount) {
          return rightTurnCount - leftTurnCount;
        }
        return right.completedAt.localeCompare(left.completedAt);
      }),
    [inferredCheckpointTurnCountByTurnId, turnDiffSummaries],
  );

  useEffect(() => {
    if (!routeThreadRef || diffSelection.kind !== "turn") return;
    useDiffPanelStore.getState().reconcileTurnSelection(
      routeThreadRef,
      orderedTurnDiffSummaries.map((summary) => summary.turnId),
    );
  }, [diffSelection, orderedTurnDiffSummaries, routeThreadRef]);

  const selectedTurnId = diffSelection.kind === "turn" ? diffSelection.turnId : null;
  const selectedGitScope = diffSelection.kind === "unstaged" ? "unstaged" : "branch";
  const selectedBaseRef = diffSelection.kind === "branch" ? diffSelection.baseRef : null;
  const selectedFilePath = diffSelection.kind === "turn" ? diffSelection.filePath : null;
  const selectedFileRevealRequestId =
    diffSelection.kind === "turn" ? diffSelection.revealRequestId : 0;
  const selectedTurn =
    selectedTurnId === null
      ? undefined
      : (orderedTurnDiffSummaries.find((summary) => summary.turnId === selectedTurnId) ??
        orderedTurnDiffSummaries[0]);
  const selectedCheckpointTurnCount =
    selectedTurn &&
    (selectedTurn.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[selectedTurn.turnId]);
  const latestTurn = orderedTurnDiffSummaries[0];
  const selectedScopeLabel =
    selectedTurnId === null
      ? selectedGitScope === "unstaged"
        ? "Working tree"
        : "Branch changes"
      : selectedTurn?.turnId === latestTurn?.turnId
        ? "Latest turn"
        : `Turn ${selectedCheckpointTurnCount ?? "?"}`;
  const reviewSectionId = selectedTurn ? `turn:${selectedTurn.turnId}` : selectedGitScope;
  const collapseScopeKey = routeThreadRef
    ? `${routeThreadRef.environmentId}:${routeThreadRef.threadId}:${reviewSectionId}`
    : null;
  const codeViewMountKey = `${collapseScopeKey ?? reviewSectionId}:${codeViewRevision}`;
  const collapsedDiffFileKeys =
    collapsedDiffFiles.scopeKey === collapseScopeKey
      ? collapsedDiffFiles.fileKeys
      : EMPTY_COLLAPSED_DIFF_FILE_KEYS;
  const reviewSectionTitle = selectedTurn
    ? `Turn ${selectedCheckpointTurnCount ?? "?"}`
    : selectedGitScope === "unstaged"
      ? "Working tree"
      : "Branch changes";
  const selectedCheckpointRange = useMemo(
    () =>
      typeof selectedCheckpointTurnCount === "number"
        ? {
            fromTurnCount: Math.max(0, selectedCheckpointTurnCount - 1),
            toTurnCount: selectedCheckpointTurnCount,
          }
        : null,
    [selectedCheckpointTurnCount],
  );
  const activeCheckpointDiff = useCheckpointDiff(
    {
      environmentId: activeThread?.environmentId ?? null,
      threadId: activeThreadId,
      fromTurnCount: selectedCheckpointRange?.fromTurnCount ?? null,
      toTurnCount: selectedCheckpointRange?.toTurnCount ?? null,
      ignoreWhitespace: diffIgnoreWhitespace,
      cacheScope: selectedTurn ? `turn:${selectedTurn.turnId}` : null,
    },
    { enabled: isGitRepo && selectedTurn !== undefined },
  );
  const branchDiffPreview = useEnvironmentQuery(
    selectedTurnId === null && activeThread && activeCwd
      ? reviewEnvironment.diffPreview({
          environmentId: activeThread.environmentId,
          input: {
            cwd: activeCwd,
            ...(selectedBaseRef ? { baseRef: selectedBaseRef } : {}),
            ignoreWhitespace: diffIgnoreWhitespace,
          },
        })
      : null,
  );
  const refreshBranchDiffPreview = branchDiffPreview.refresh;
  const canRefreshGitDiff =
    isGitRepo && selectedTurnId === null && activeThread != null && activeCwd != null;
  const activeThreadRefreshKey = routeThreadRef
    ? `${routeThreadRef.environmentId}:${routeThreadRef.threadId}`
    : null;
  const gitDiffRevision = useMemo(
    () => getGitDiffRevision(gitStatusQuery.data),
    [gitStatusQuery.data],
  );

  useEffect(() => {
    if (!canRefreshGitDiff) return;
    const refreshOnFocus = () => refreshBranchDiffPreview();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [canRefreshGitDiff, refreshBranchDiffPreview]);

  useEffect(() => {
    const current = {
      threadKey: activeThreadRefreshKey,
      turnId: latestTurn?.turnId ?? null,
      gitRevision: gitDiffRevision,
      hasWorkingTreeChanges: gitStatusQuery.data?.hasWorkingTreeChanges === true,
    };
    if (!canRefreshGitDiff) {
      return;
    }
    if (branchDiffPreview.data === null) {
      return;
    }
    const shouldRefresh = shouldRefreshGitDiffPreview(
      lastGitDiffRefreshSnapshotRef.current,
      current,
    );
    lastGitDiffRefreshSnapshotRef.current = current;
    if (shouldRefresh) refreshBranchDiffPreview();
  }, [
    activeThreadRefreshKey,
    branchDiffPreview.data?.generatedAt,
    canRefreshGitDiff,
    gitDiffRevision,
    gitStatusQuery.data?.hasWorkingTreeChanges,
    latestTurn?.turnId,
    refreshBranchDiffPreview,
  ]);

  const selectedGitSource = branchDiffPreview.data?.sources.find(
    (source) => source.kind === (selectedGitScope === "unstaged" ? "working-tree" : "branch-range"),
  );
  const loadDiffFiles = useMemo<FileDiffContentsLoader | undefined>(() => {
    const preview = branchDiffPreview.data;
    if (selectedTurnId !== null || !activeThread || !preview || !selectedGitSource) {
      return undefined;
    }

    const source = selectedGitSource;
    return async (fileDiff) => {
      const newPath = resolveFileDiffPath(fileDiff);
      const oldPath = fileDiff.prevName
        ? resolveFileDiffPath({ ...fileDiff, name: fileDiff.prevName })
        : newPath;
      const result = await getDiffFileContents({
        environmentId: activeThread.environmentId,
        input: {
          cwd: preview.cwd,
          sourceKind: source.kind,
          changeType: fileDiff.type,
          baseRef: source.baseRef,
          headRef: source.headRef,
          oldPath,
          newPath,
        },
      });
      if (result._tag !== "Success") {
        throw squashAtomCommandFailure(result);
      }

      const newFile = {
        name: newPath,
        contents: result.value.newContents,
        cacheKey: `${source.diffHash}:new:${newPath}`,
      };
      if (fileDiff.type === "rename-pure") {
        return { oldFile: null, newFile };
      }
      return {
        oldFile: {
          name: oldPath,
          contents: result.value.oldContents,
          cacheKey: `${source.diffHash}:old:${oldPath}`,
        },
        newFile,
      };
    };
  }, [
    activeThread,
    branchDiffPreview.data,
    getDiffFileContents,
    selectedGitSource,
    selectedTurnId,
  ]);
  const localBranchRefs = useEnvironmentQuery(
    selectedTurnId === null &&
      selectedGitScope === "branch" &&
      activeThread &&
      branchDiffPreview.data?.cwd
      ? vcsEnvironment.listRefs({
          environmentId: activeThread.environmentId,
          input: {
            cwd: branchDiffPreview.data.cwd,
            includeMatchingRemoteRefs: true,
            refKind: "local",
            ...(baseRefQuery.trim().length > 0 ? { query: baseRefQuery.trim() } : {}),
            limit: 100,
          },
        })
      : null,
  );
  const remoteBranchRefs = useEnvironmentQuery(
    selectedTurnId === null &&
      selectedGitScope === "branch" &&
      activeThread &&
      branchDiffPreview.data?.cwd
      ? vcsEnvironment.listRefs({
          environmentId: activeThread.environmentId,
          input: {
            cwd: branchDiffPreview.data.cwd,
            includeMatchingRemoteRefs: true,
            refKind: "remote",
            ...(baseRefQuery.trim().length > 0 ? { query: baseRefQuery.trim() } : {}),
            limit: 100,
          },
        })
      : null,
  );
  const baseRefChoices = buildBaseRefChoices(
    localBranchRefs.data?.refs.filter((ref) => ref.name !== selectedGitSource?.headRef) ?? [],
    remoteBranchRefs.data?.refs ?? [],
  );
  const gitDiff = selectedGitSource?.diff;

  const selectedPatch = selectedTurn ? activeCheckpointDiff.data?.diff : gitDiff;
  const isSelectedPatchTruncated = !selectedTurn && selectedGitSource?.truncated === true;
  const isLoadingSelectedPatch = selectedTurn
    ? activeCheckpointDiff.isPending
    : branchDiffPreview.isPending;
  const selectedPatchError = selectedTurn ? activeCheckpointDiff.error : branchDiffPreview.error;
  const hasResolvedPatch = typeof selectedPatch === "string";
  const hasNoNetChanges = hasResolvedPatch && selectedPatch.trim().length === 0;
  const renderablePatch = useMemo(
    () =>
      getRenderablePatch(selectedPatch, `diff-panel:${resolvedTheme}:${codeTheme}`, {
        compactPartialHunkOffsets: selectedTurnId === null,
      }),
    [codeTheme, resolvedTheme, selectedPatch, selectedTurnId],
  );
  const renderableFiles = useMemo(() => {
    if (!renderablePatch || renderablePatch.kind !== "files") {
      return [];
    }
    return renderablePatch.files.toSorted((left, right) =>
      resolveFileDiffPath(left).localeCompare(resolveFileDiffPath(right), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [renderablePatch]);
  const renderableFileEntries = useMemo(
    () =>
      renderableFiles.map((fileDiff) => ({
        fileDiff,
        fileKey: buildFileDiffRenderKey(fileDiff),
      })),
    [renderableFiles],
  );
  const codeViewFiles = useMemo(
    () =>
      renderableFileEntries.map(({ fileDiff, fileKey }) => {
        return {
          fileDiff,
          filePath: resolveFileDiffPath(fileDiff),
          fileKey,
          collapsed: collapsedDiffFileKeys.has(fileKey),
        };
      }),
    [collapsedDiffFileKeys, renderableFileEntries],
  );
  const diffFileKeys = useMemo(() => codeViewFiles.map((file) => file.fileKey), [codeViewFiles]);
  const allDiffFilesCollapsed = areAllDiffFilesCollapsed(diffFileKeys, collapsedDiffFileKeys);
  const diffLineStat = useMemo(() => getDiffLineStat(renderableFiles), [renderableFiles]);
  const diffFileTreeEntries = useMemo<DiffFileTreeEntry[]>(
    () =>
      codeViewFiles.map(({ fileDiff, filePath, fileKey }) => ({
        fileKey,
        path: filePath,
        changeType: fileDiff.type,
        stat: getFileDiffLineStat(fileDiff),
      })),
    [codeViewFiles],
  );
  const revealedDiffFileKey =
    revealedDiffFile.scopeKey === collapseScopeKey ? revealedDiffFile.fileKey : null;

  useEffect(() => {
    if (isNarrow || renderablePatch?.kind !== "files") return;
    const viewport = diffFilesViewportRef.current;
    if (!viewport) return;

    const updateWidth = (width: number) => {
      if (!Number.isFinite(width) || width <= 0) return;
      const nextWidth = Math.round(width);
      setDiffFilesViewportWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    };

    updateWidth(viewport.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateWidth(entry.contentRect.width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isNarrow, renderablePatch]);

  useEffect(() => {
    if (!selectedFilePath) return;
    const file = codeViewFiles.find((candidate) => candidate.filePath === selectedFilePath);
    if (!file) return;
    setRevealedDiffFile({ scopeKey: collapseScopeKey, fileKey: file.fileKey });
    codeViewRef.current?.scrollTo({ type: "item", id: file.fileKey, align: "start" });
  }, [
    codeViewFiles,
    codeViewMountKey,
    collapseScopeKey,
    selectedFilePath,
    selectedFileRevealRequestId,
  ]);

  const openDiffFile = useCallback(
    (filePath: string) => {
      openDiffFilePrimaryAction({
        threadRef: routeThreadRef,
        filePath,
        activeCwd,
        openInEditor: (targetPath) => {
          void (async () => {
            const result = await openInPreferredEditor(targetPath);
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              console.warn("Failed to open diff file in editor.", {
                operation: "open-diff-file",
                ...(routeThreadRef
                  ? {
                      environmentId: routeThreadRef.environmentId,
                      threadId: routeThreadRef.threadId,
                    }
                  : {}),
                ...safeErrorLogAttributes(squashAtomCommandFailure(result)),
              });
            }
          })();
        },
      });
    },
    [activeCwd, openInPreferredEditor, routeThreadRef],
  );
  const toggleDiffFileCollapsed = useCallback(
    (fileKey: string) => {
      setCollapsedDiffFiles((current) => {
        const next = new Set(current.scopeKey === collapseScopeKey ? current.fileKeys : []);
        if (next.has(fileKey)) {
          next.delete(fileKey);
        } else {
          next.add(fileKey);
        }
        return { scopeKey: collapseScopeKey, fileKeys: next };
      });
    },
    [collapseScopeKey],
  );

  const revealDiffFile = useCallback(
    (fileKey: string) => {
      setRevealedDiffFile({ scopeKey: collapseScopeKey, fileKey });
      // Expanding the target keeps its own start offset, so the scroll target
      // stays correct even when the file was collapsed.
      setCollapsedDiffFiles((current) => {
        const currentKeys =
          current.scopeKey === collapseScopeKey ? current.fileKeys : EMPTY_COLLAPSED_DIFF_FILE_KEYS;
        if (!currentKeys.has(fileKey)) {
          return current.scopeKey === collapseScopeKey
            ? current
            : { scopeKey: collapseScopeKey, fileKeys: EMPTY_COLLAPSED_DIFF_FILE_KEYS };
        }
        const fileKeys = new Set(currentKeys);
        fileKeys.delete(fileKey);
        return { scopeKey: collapseScopeKey, fileKeys };
      });
      codeViewRef.current?.scrollTo({ type: "item", id: fileKey, align: "start" });
    },
    [collapseScopeKey],
  );

  const toggleDiffFileCollapse = useCallback(() => {
    setCodeViewRevision((current) => current + 1);
    setCollapsedDiffFiles((current) => {
      const currentKeys =
        current.scopeKey === collapseScopeKey ? current.fileKeys : EMPTY_COLLAPSED_DIFF_FILE_KEYS;

      return {
        scopeKey: collapseScopeKey,
        fileKeys: toggleAllDiffFiles(diffFileKeys, currentKeys),
      };
    });
  }, [collapseScopeKey, diffFileKeys]);

  const selectTurn = (turnId: TurnId) => {
    if (!routeThreadRef) return;
    useDiffPanelStore.getState().selectTurn(routeThreadRef, turnId);
  };
  const selectGitScope = (scope: "branch" | "unstaged") => {
    if (!routeThreadRef) return;
    useDiffPanelStore.getState().selectGitScope(routeThreadRef, scope);
  };
  const selectBranchBaseRef = (baseRef: string | null) => {
    if (!routeThreadRef) return;
    useDiffPanelStore.getState().selectBranchBaseRef(routeThreadRef, baseRef);
  };

  // Kept as one value so the branch picker can move between the header row and
  // its own mobile row without duplicating the narrowing.
  const baseRefComparison =
    selectedTurnId === null && selectedGitScope === "branch" && selectedGitSource?.baseRef
      ? {
          headRef: selectedGitSource.headRef ?? "HEAD",
          baseRef: selectedGitSource.baseRef,
        }
      : null;

  const headerRow = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3 [-webkit-app-region:no-drag]">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-foreground outline-none transition-colors max-[980px]:h-8 max-[980px]:px-2.5 hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Diff scope: ${selectedScopeLabel}`}
          >
            <span className="truncate">{selectedScopeLabel}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem
              className={
                selectedTurnId === null && selectedGitScope === "unstaged"
                  ? "bg-foreground/[0.08]"
                  : undefined
              }
              onClick={() => selectGitScope("unstaged")}
            >
              <span>Working tree</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={
                selectedTurnId === null && selectedGitScope === "branch"
                  ? "bg-foreground/[0.08]"
                  : undefined
              }
              onClick={() => selectGitScope("branch")}
            >
              <span>Branch changes</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={
                selectedTurnId !== null && selectedTurn?.turnId === latestTurn?.turnId
                  ? "bg-foreground/[0.08]"
                  : undefined
              }
              onClick={() => {
                if (latestTurn) selectTurn(latestTurn.turnId);
              }}
            >
              <span>Latest turn</span>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Turn</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {orderedTurnDiffSummaries.map((summary) => {
                  const turnCount =
                    summary.checkpointTurnCount ??
                    inferredCheckpointTurnCountByTurnId[summary.turnId] ??
                    "?";
                  return (
                    <DropdownMenuItem
                      key={summary.turnId}
                      className={
                        summary.turnId === selectedTurn?.turnId ? "bg-foreground/[0.08]" : undefined
                      }
                      onClick={() => selectTurn(summary.turnId)}
                    >
                      <span>Turn {turnCount}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatShortTimestamp(summary.completedAt, settings.timestampFormat)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        {baseRefComparison && !isNarrow && (
          <DiffBaseRefPicker
            headRef={baseRefComparison.headRef}
            baseRef={baseRefComparison.baseRef}
            choices={baseRefChoices}
            selectedBaseRef={selectedBaseRef}
            query={baseRefQuery}
            onQueryChange={setBaseRefQuery}
            onSelectBaseRef={selectBranchBaseRef}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
        {codeViewFiles.length > 0 && (
          <DiffStatLabel
            additions={diffLineStat.additions}
            deletions={diffLineStat.deletions}
            className="mr-1 text-[11px]"
            layout="inline"
          />
        )}
        <DiffToolbarActions
          compact={isNarrow}
          hasFiles={codeViewFiles.length > 0}
          canRefresh={canRefreshGitDiff}
          isRefreshing={branchDiffPreview.isPending}
          onRefresh={refreshBranchDiffPreview}
          fileTreeVisible={fileTreeVisible}
          onFileTreeVisibleChange={setFileTreeVisible}
          allFilesCollapsed={allDiffFilesCollapsed}
          onToggleAllFiles={toggleDiffFileCollapse}
          diffRenderMode={diffRenderMode}
          onDiffRenderModeChange={setDiffRenderMode}
          wordWrap={wordWrap}
          onWordWrapChange={setWordWrap}
          ignoreWhitespace={diffIgnoreWhitespace}
          onIgnoreWhitespaceChange={setDiffIgnoreWhitespace}
        />
      </div>
    </>
  );

  return (
    <DiffPanelShell mode={mode} header={headerRow}>
      {!activeThread ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Select a thread to inspect turn diffs.
        </div>
      ) : !isGitRepo ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Turn diffs are unavailable because this project is not a git repository.
        </div>
      ) : selectedTurnId !== null && orderedTurnDiffSummaries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          No completed turns yet.
        </div>
      ) : (
        <>
          <div className="diff-panel-viewport flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {baseRefComparison && isNarrow && (
              <DiffBaseRefPicker
                className="h-9 shrink-0 gap-2 border-b border-border/60 px-3"
                headRefClassName="max-w-[40%]"
                triggerClassName="min-h-8 max-w-[60%] px-2"
                headRef={baseRefComparison.headRef}
                baseRef={baseRefComparison.baseRef}
                choices={baseRefChoices}
                selectedBaseRef={selectedBaseRef}
                query={baseRefQuery}
                onQueryChange={setBaseRefQuery}
                onSelectBaseRef={selectBranchBaseRef}
              />
            )}
            {isSelectedPatchTruncated && (
              <p className="shrink-0 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                This diff was truncated because it exceeded the preview limit. The changes shown are
                incomplete.
              </p>
            )}
            {selectedPatchError && !renderablePatch && (
              <div className="px-3">
                <p className="mb-2 text-[11px] text-error/80">{selectedPatchError}</p>
              </div>
            )}
            {!renderablePatch ? (
              isLoadingSelectedPatch ? (
                <DiffPanelLoadingState
                  label={
                    selectedTurn
                      ? "Loading checkpoint diff..."
                      : selectedGitScope === "unstaged"
                        ? "Loading working tree diff..."
                        : "Loading branch diff..."
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center px-3 py-2 text-xs text-muted-foreground/70">
                  <p>
                    {hasNoNetChanges
                      ? "No net changes in this selection."
                      : "No patch available for this selection."}
                  </p>
                </div>
              )
            ) : renderablePatch.kind === "files" ? (
              <div ref={diffFilesViewportRef} className="relative flex min-h-0 min-w-0 flex-1">
                {fileTreeVisible &&
                  (isNarrow ? (
                    // A sheet cannot spare width for a docked column, so the tree
                    // covers the diff until a file is picked.
                    <DiffFileTree
                      className="absolute inset-0 z-20 bg-background"
                      touch
                      entries={diffFileTreeEntries}
                      activeFileKey={revealedDiffFileKey}
                      resolvedTheme={resolvedTheme}
                      onClose={() => setFileTreeVisible(false)}
                      onSelectFile={(entry) => {
                        revealDiffFile(entry.fileKey);
                        setFileTreeVisible(false);
                      }}
                    />
                  ) : (
                    <div
                      className="relative h-full shrink-0"
                      style={{ width: `${diffFileTreeWidth}px` }}
                    >
                      <DiffFileTree
                        className="h-full border-r border-border/70"
                        entries={diffFileTreeEntries}
                        activeFileKey={revealedDiffFileKey}
                        resolvedTheme={resolvedTheme}
                        onSelectFile={(entry) => revealDiffFile(entry.fileKey)}
                      />
                      <div
                        role="separator"
                        aria-label="Resize file tree"
                        aria-orientation="vertical"
                        aria-valuemin={DIFF_FILE_TREE_MIN_WIDTH}
                        aria-valuemax={diffFileTreeMaxWidth}
                        aria-valuenow={Math.round(diffFileTreeWidth)}
                        className="group absolute inset-y-0 -right-1 z-20 w-2 touch-none cursor-col-resize select-none"
                        {...diffFileTreeResizeHandlers}
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-primary/60 group-active:bg-primary"
                        />
                      </div>
                    </div>
                  ))}
                <div
                  className="min-h-0 min-w-0 flex-1"
                  onClickCapture={(event) => {
                    const composedPath = event.nativeEvent.composedPath?.() ?? [];
                    const title = composedPath.find(
                      (node): node is HTMLElement =>
                        node instanceof HTMLElement && node.hasAttribute("data-title"),
                    );
                    const filePath = title?.textContent?.trim();
                    if (filePath) openDiffFile(filePath);
                  }}
                >
                  <AnnotatableCodeView
                    key={collapseScopeKey ?? reviewSectionId}
                    viewerRef={codeViewRef}
                    codeViewKey={codeViewMountKey}
                    className="diff-render-surface h-full min-h-0 overflow-auto"
                    files={codeViewFiles}
                    sectionId={reviewSectionId}
                    sectionTitle={reviewSectionTitle}
                    composerDraftTarget={composerDraftTarget}
                    renderHeaderPrefix={(fileDiff, fileKey, collapsed) => {
                      const filePath = resolveFileDiffPath(fileDiff);
                      return (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 transition-colors hover:bg-foreground/10 focus-visible:outline-hidden",
                                  getDiffCollapseIconClassName(fileDiff),
                                )}
                                aria-label={
                                  collapsed ? `Expand ${filePath}` : `Collapse ${filePath}`
                                }
                                aria-expanded={!collapsed}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleDiffFileCollapsed(fileKey);
                                }}
                              />
                            }
                          >
                            {collapsed ? (
                              <ChevronRightIcon className="size-4" />
                            ) : (
                              <ChevronDownIcon className="size-4" />
                            )}
                          </TooltipTrigger>
                          <TooltipPopup side="top">
                            {collapsed ? "Expand diff" : "Collapse diff"}
                          </TooltipPopup>
                        </Tooltip>
                      );
                    }}
                    options={{
                      diffStyle: diffRenderMode === "split" ? "split" : "unified",
                      lineDiffType: "none",
                      overflow: wordWrap ? "wrap" : "scroll",
                      theme: resolveDiffThemeName(resolvedTheme, codeTheme),
                      themeType: resolveDiffThemeType(resolvedTheme, codeTheme),
                      unsafeCSS: DIFF_PANEL_UNSAFE_CSS,
                      stickyHeaders: true,
                      ...(loadDiffFiles ? { loadDiffFiles } : {}),
                      itemMetrics: {
                        diffHeaderHeight: 32,
                        hunkSeparatorHeight: 24,
                        paddingTop: 0,
                        paddingBottom: 0,
                      },
                      layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground/75">{renderablePatch.reason}</p>
                  <pre
                    className={cn(
                      "max-h-[72vh] rounded-md border border-border/70 bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90",
                      wordWrap
                        ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                        : "overflow-auto",
                    )}
                  >
                    {renderablePatch.text}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </DiffPanelShell>
  );
}
