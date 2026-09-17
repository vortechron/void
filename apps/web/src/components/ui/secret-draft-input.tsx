"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { useCommitOnBlur } from "~/hooks/useCommitOnBlur";
import { Button } from "./button";
import type { InputProps } from "./input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";

export type SecretDraftInputProps = Omit<
  InputProps,
  "className" | "value" | "onChange" | "defaultValue" | "type"
> & {
  readonly className?: string;
  readonly value: string;
  readonly onCommit: (next: string) => void;
  /** Wording for the reveal button, e.g. "OpenAI API key". */
  readonly secretLabel: string;
};

/**
 * `<DraftInput>` for a secret such as an API key: masked by default, with a
 * toggle that reveals it. Revealing matters because a mistyped key is
 * invisible behind dots, and the toggle keeps the key hidden the rest of the
 * time, including from anyone watching a shared screen.
 */
export function SecretDraftInput({
  className,
  disabled,
  secretLabel,
  value,
  onCommit,
  ...rest
}: SecretDraftInputProps) {
  const [revealed, setRevealed] = useState(false);
  const bag = useCommitOnBlur(value, onCommit);

  return (
    <InputGroup className={className}>
      <InputGroupInput
        {...rest}
        {...bag}
        disabled={disabled}
        type={revealed ? "text" : "password"}
      />
      <InputGroupAddon align="inline-end">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={revealed ? `Hide ${secretLabel}` : `Show ${secretLabel}`}
          aria-pressed={revealed}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
