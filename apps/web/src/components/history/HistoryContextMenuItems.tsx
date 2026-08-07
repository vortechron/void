/**
 * Renders the menu model from `historyMenu.ts`.
 *
 * Purely presentational: every decision about what appears and whether it is
 * enabled already happened in the model, so this only maps items onto the menu
 * primitives and hands the chosen action back.
 */
import { Fragment } from "react";

import {
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/components/ui/menu";

import type { HistoryMenuAction, HistoryMenuGroup, HistoryMenuItem } from "./historyMenu";

function MenuEntry({
  item,
  onSelect,
}: {
  item: HistoryMenuItem;
  onSelect: (action: HistoryMenuAction) => void;
}) {
  if (item.submenu) {
    return (
      <MenuSub>
        <MenuSubTrigger disabled={item.disabled}>{item.label}</MenuSubTrigger>
        <MenuSubPopup>
          {item.submenu.map((child) => (
            <MenuEntry key={child.id} item={child} onSelect={onSelect} />
          ))}
        </MenuSubPopup>
      </MenuSub>
    );
  }

  const action = item.action;
  return (
    <MenuItem
      disabled={item.disabled || action === undefined}
      variant={item.destructive ? "destructive" : "default"}
      onClick={() => {
        if (action) onSelect(action);
      }}
    >
      {item.label}
    </MenuItem>
  );
}

export function HistoryContextMenuItems({
  groups,
  onSelect,
}: {
  groups: ReadonlyArray<HistoryMenuGroup>;
  onSelect: (action: HistoryMenuAction) => void;
}) {
  if (groups.length === 0) {
    return <MenuItem disabled>Nothing to do here</MenuItem>;
  }

  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? <MenuSeparator /> : null}
          {group.items.map((item) => (
            <MenuEntry key={item.id} item={item} onSelect={onSelect} />
          ))}
        </Fragment>
      ))}
    </>
  );
}
