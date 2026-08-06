/**
 * Say a phrase, get saved text.
 *
 * The expansion is plain string replacement rather than something the cleanup
 * pass is asked to do: an address or a link has to come out exactly right every
 * time, and the cleanup pass can be turned off.
 */
import type { VoiceDictationSnippet } from "@t3tools/contracts/settings";
import { ArrowRightIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { removeSnippet, upsertSnippet } from "./voiceDictationLists";

const SNIPPET_FORM_ID = "voice-snippet-form";

export function VoiceSnippetsSection({
  snippets,
  disabled,
  onChange,
}: {
  snippets: ReadonlyArray<VoiceDictationSnippet>;
  disabled: boolean;
  onChange: (next: ReadonlyArray<VoiceDictationSnippet>) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState("");
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VoiceDictationSnippet | null>(null);

  const openAdd = () => {
    setEditingId(null);
    setTrigger("");
    setReplacement("");
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (snippet: VoiceDictationSnippet) => {
    setEditingId(snippet.id);
    setTrigger(snippet.trigger);
    setReplacement(snippet.replacement);
    setError(null);
    setDialogOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = upsertSnippet(snippets, {
      trigger,
      replacement,
      ...(editingId !== null ? { editingId } : {}),
    });
    setError(result.error);
    if (!result.next) return;
    onChange(result.next);
    setDialogOpen(false);
  };

  return (
    <SettingsSection
      id="voice-dictation-snippets"
      title="Snippets"
      headerAction={
        <Button size="xs" variant="outline" disabled={disabled} onClick={openAdd}>
          <PlusIcon />
          Add
        </Button>
      }
    >
      <SettingsRow
        {...searchableSetting("voice-dictation-snippets")}
        description="Text you would rather not dictate letter by letter — an address, a link, a prompt you reuse. Say the phrase and the saved text takes its place."
      >
        {snippets.length === 0 ? (
          <p className="mt-1 mb-2 text-[13px] text-muted-foreground/70">
            No snippets yet. Add one and say its phrase while dictating.
          </p>
        ) : (
          <ul className="mt-1 mb-2 divide-y divide-border/60 rounded-lg border border-border/60">
            {snippets.map((snippet) => (
              <li key={snippet.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
                  <span className="shrink-0 font-medium text-foreground">{snippet.trigger}</span>
                  <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground/60" />
                  <span className="truncate text-muted-foreground">{snippet.replacement}</span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Edit the snippet for "${snippet.trigger}"`}
                    onClick={() => openEdit(snippet)}
                  >
                    <PencilIcon className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Delete the snippet for "${snippet.trigger}"`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingDelete(snippet)}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsRow>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{editingId === null ? "Add snippet" : "Edit snippet"}</DialogTitle>
            <DialogDescription>
              The phrase is matched whole and ignores capitalisation.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form id={SNIPPET_FORM_ID} className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="voice-snippet-trigger">
                  When I say
                </label>
                <Input
                  id="voice-snippet-trigger"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="my email"
                  value={trigger}
                  onChange={(event) => setTrigger(event.currentTarget.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="voice-snippet-replacement">
                  Write this
                </label>
                <Textarea
                  id="voice-snippet-replacement"
                  className="min-h-20"
                  spellCheck={false}
                  placeholder="hello@example.com"
                  value={replacement}
                  onChange={(event) => setReplacement(event.currentTarget.value)}
                />
              </div>
              {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
            </form>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={SNIPPET_FORM_ID}>
              {editingId === null ? "Add snippet" : "Save"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the snippet for "{pendingDelete?.trigger}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Saying that phrase will dictate it as ordinary words again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onChange(removeSnippet(snippets, pendingDelete.id));
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </SettingsSection>
  );
}
