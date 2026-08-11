import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  Columns2Icon,
  ListTreeIcon,
  MoreHorizontalIcon,
  PilcrowIcon,
  RefreshCwIcon,
  Rows3Icon,
  TextWrapIcon,
} from "lucide-react";

import type { DiffRenderMode } from "~/diffPanelStore";
import { cn } from "~/lib/utils";

import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/menu";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface DiffToolbarActionsProps {
  /** Collapse everything except the file tree toggle into an overflow menu. */
  compact: boolean;
  hasFiles: boolean;
  canRefresh: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  fileTreeVisible: boolean;
  onFileTreeVisibleChange: (visible: boolean) => void;
  allFilesCollapsed: boolean;
  onToggleAllFiles: () => void;
  diffRenderMode: DiffRenderMode;
  onDiffRenderModeChange: (mode: DiffRenderMode) => void;
  wordWrap: boolean;
  onWordWrapChange: (wordWrap: boolean) => void;
  ignoreWhitespace: boolean;
  onIgnoreWhitespaceChange: (ignoreWhitespace: boolean) => void;
}

function FileTreeToggle(props: {
  compact: boolean;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
}) {
  const label = props.visible ? "Hide file tree" : "Show file tree";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            aria-label={label}
            variant="outline"
            size={props.compact ? "sm" : "xs"}
            pressed={props.visible}
            onPressedChange={(pressed) => props.onVisibleChange(Boolean(pressed))}
          />
        }
      >
        <ListTreeIcon className={props.compact ? "size-4" : "size-3"} />
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

function DiffOverflowMenu(props: DiffToolbarActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="icon-sm" variant="ghost" aria-label="More diff options" />
        }
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {props.canRefresh && (
          <DropdownMenuItem onClick={props.onRefresh}>
            <RefreshCwIcon className={cn("size-4", props.isRefreshing && "animate-spin")} />
            <span>{props.isRefreshing ? "Refreshing diff…" : "Refresh diff"}</span>
          </DropdownMenuItem>
        )}
        {props.hasFiles && (
          <DropdownMenuItem onClick={props.onToggleAllFiles}>
            {props.allFilesCollapsed ? (
              <ChevronsUpDownIcon className="size-4" />
            ) : (
              <ChevronsDownUpIcon className="size-4" />
            )}
            <span>{props.allFilesCollapsed ? "Expand all files" : "Collapse all files"}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Layout</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={props.diffRenderMode}
            onValueChange={(value) => {
              if (value === "stacked" || value === "split") props.onDiffRenderModeChange(value);
            }}
          >
            <DropdownMenuRadioItem value="stacked">
              <span className="flex min-w-0 items-center gap-2">
                <Rows3Icon className="size-4" />
                <span className="min-w-0 truncate">Stacked</span>
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="split">
              <span className="flex min-w-0 items-center gap-2">
                <Columns2Icon className="size-4" />
                <span className="min-w-0 truncate">Split</span>
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={props.wordWrap}
          closeOnClick={false}
          variant="switch"
          onCheckedChange={(checked) => props.onWordWrapChange(Boolean(checked))}
        >
          <span className="flex items-center gap-2">
            <TextWrapIcon className="size-4" />
            <span>Wrap lines</span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={props.ignoreWhitespace}
          closeOnClick={false}
          variant="switch"
          onCheckedChange={(checked) => props.onIgnoreWhitespaceChange(Boolean(checked))}
        >
          <span className="flex items-center gap-2">
            <PilcrowIcon className="size-4" />
            <span>Ignore whitespace</span>
          </span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DiffToolbarActions(props: DiffToolbarActionsProps) {
  if (props.compact) {
    return (
      <>
        {props.hasFiles && (
          <FileTreeToggle
            compact
            visible={props.fileTreeVisible}
            onVisibleChange={props.onFileTreeVisibleChange}
          />
        )}
        <DiffOverflowMenu {...props} />
      </>
    );
  }

  return (
    <>
      {props.canRefresh && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={props.isRefreshing ? "Refreshing diff" : "Refresh diff"}
                onClick={props.onRefresh}
              />
            }
          >
            <RefreshCwIcon className={cn("size-3.5", props.isRefreshing && "animate-spin")} />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {props.isRefreshing ? "Refreshing diff…" : "Refresh diff"}
          </TooltipPopup>
        </Tooltip>
      )}
      {props.hasFiles && (
        <FileTreeToggle
          compact={false}
          visible={props.fileTreeVisible}
          onVisibleChange={props.onFileTreeVisibleChange}
        />
      )}
      {props.hasFiles && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={props.allFilesCollapsed ? "Expand all files" : "Collapse all files"}
                onClick={props.onToggleAllFiles}
              />
            }
          >
            {props.allFilesCollapsed ? (
              <ChevronsUpDownIcon className="size-3.5" />
            ) : (
              <ChevronsDownUpIcon className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipPopup side="top">
            {props.allFilesCollapsed ? "Expand all files" : "Collapse all files"}
          </TooltipPopup>
        </Tooltip>
      )}
      <ToggleGroup
        className="shrink-0 gap-1"
        size="sm"
        value={[props.diffRenderMode]}
        onValueChange={(value) => {
          const next = value[0];
          if (next === "stacked" || next === "split") props.onDiffRenderModeChange(next);
        }}
      >
        <Toggle aria-label="Stacked diff view" value="stacked" variant="ghost">
          <Rows3Icon className="size-3.5" />
        </Toggle>
        <Toggle aria-label="Split diff view" value="split" variant="ghost">
          <Columns2Icon className="size-3.5" />
        </Toggle>
      </ToggleGroup>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label={
                props.wordWrap ? "Disable diff line wrapping" : "Enable diff line wrapping"
              }
              variant="ghost"
              size="sm"
              pressed={props.wordWrap}
              onPressedChange={(pressed) => props.onWordWrapChange(Boolean(pressed))}
            />
          }
        >
          <TextWrapIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="top">
          {props.wordWrap ? "Disable line wrapping" : "Enable line wrapping"}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label={
                props.ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"
              }
              variant="ghost"
              size="sm"
              pressed={props.ignoreWhitespace}
              onPressedChange={(pressed) => props.onIgnoreWhitespaceChange(Boolean(pressed))}
            />
          }
        >
          <PilcrowIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="top">
          {props.ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"}
        </TooltipPopup>
      </Tooltip>
    </>
  );
}
