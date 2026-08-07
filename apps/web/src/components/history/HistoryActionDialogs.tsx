/**
 * The two interruptions a commit-graph action can need: a name to type, or a
 * destructive change to confirm.
 *
 * Both are driven by the menu model rather than by each call site, so a new menu
 * entry gets its prompt or its confirmation by describing one, not by wiring a
 * new dialog.
 */
import { type FormEvent, useEffect, useId, useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import type { HistoryConfirm, HistoryPrompt } from "./historyMenu";

export function HistoryPromptDialog({
  prompt,
  onSubmit,
  onClose,
}: {
  prompt: HistoryPrompt | null;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const fieldId = useId();
  const [value, setValue] = useState("");

  // Reopening for a different action must not inherit the last typed value.
  useEffect(() => {
    setValue(prompt?.initialValue ?? "");
  }, [prompt]);

  if (!prompt) return null;

  const trimmed = value.trim();
  const canSubmit = prompt.optional === true || trimmed.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form className="space-y-2" onSubmit={submit}>
            <Label htmlFor={fieldId}>{prompt.label}</Label>
            <Input
              autoFocus
              id={fieldId}
              value={value}
              placeholder={prompt.placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            {prompt.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function HistoryConfirmDialog({
  confirm,
  onConfirm,
  onClose,
}: {
  confirm: HistoryConfirm | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!confirm) return null;

  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirm.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
