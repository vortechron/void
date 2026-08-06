/**
 * Words the transcription model would otherwise guess at.
 *
 * The list goes two places: to the transcription session as a vocabulary hint,
 * so the right spelling is heard in the first place, and to the cleanup pass,
 * which gets a second chance at anything that slipped through.
 */
import { XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { addDictionaryTerm, removeDictionaryTerm } from "./voiceDictationLists";

export function VoiceDictionarySection({
  dictionary,
  disabled,
  onChange,
}: {
  dictionary: ReadonlyArray<string>;
  disabled: boolean;
  onChange: (next: ReadonlyArray<string>) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const result = addDictionaryTerm(dictionary, draft);
    setError(result.error);
    if (!result.next) return;
    onChange(result.next);
    setDraft("");
  };

  return (
    <SettingsSection id="voice-dictation-dictionary" title="Dictionary">
      <SettingsRow
        {...searchableSetting("voice-dictation-dictionary")}
        description="Names, jargon and product words you say often. Add them here and dictation stops guessing at their spelling."
        status={error}
      >
        <form className="mt-3 flex gap-2" onSubmit={handleAdd}>
          <Input
            disabled={disabled}
            className="w-full sm:max-w-64"
            spellCheck={false}
            autoComplete="off"
            placeholder="Vortechron"
            aria-label="New dictionary term"
            value={draft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              if (error) setError(null);
            }}
          />
          <Button type="submit" variant="outline" size="sm" disabled={disabled}>
            Add
          </Button>
        </form>

        {dictionary.length === 0 ? (
          <p className="mt-3 mb-2 text-[13px] text-muted-foreground/70">
            No terms yet. Dictation will spell everything the way it hears it.
          </p>
        ) : (
          <ul className="mt-3 mb-2 flex flex-wrap gap-1.5">
            {dictionary.map((term) => (
              <li key={term}>
                <span className="inline-flex items-center gap-1 rounded-md bg-muted py-1 pr-1 pl-2 text-[13px] text-foreground">
                  {term}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remove ${term} from the dictionary`}
                    className="size-4 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setError(null);
                      onChange(removeDictionaryTerm(dictionary, term));
                    }}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
