import { memo, useEffect, useRef, type MouseEventHandler, type PointerEventHandler } from "react";
import { ChevronDownIcon, ChevronLeftIcon, MicIcon } from "lucide-react";
import type { VoiceDictationStatus } from "~/hooks/useVoiceDictation";
import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { StageBackdropButtonArt, useSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

/**
 * How long the send button has to be held before it starts listening. Long
 * enough that an ordinary click never trips it, short enough that a user who
 * means to dictate is not left wondering whether the press registered.
 */
export const DICTATION_HOLD_DELAY_MS = 280;

export interface ComposerDictationControls {
  readonly status: VoiceDictationStatus;
  readonly available: boolean;
  /** Why dictation is not on offer, for the button's label. */
  readonly unavailableMessage: string | null;
  readonly onHoldStart: () => void;
  readonly onHoldEnd: () => void;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  dictation?: ComposerDictationControls | null;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
}

export const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  if (!input.isLastQuestion) {
    return "Next question";
  }
  return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
};

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  pendingAction,
  isRunning,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  sendDisabledReason,
  isConnecting,
  isEnvironmentUnavailable,
  isPreparingWorktree,
  hasSendableContent,
  preserveComposerFocusOnPointerDown = false,
  dictation = null,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
}: ComposerPrimaryActionsProps) {
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const isSendDisabled = sendDisabledReason !== null;
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );

  const holdTimerRef = useRef<number | null>(null);
  const holdPointerRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);
  const suppressClickRef = useRef(false);
  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    },
    [],
  );

  const isDictating = dictation !== null && dictation.status !== "idle";
  // Send stays blocked without content, but a hold has to be reachable from an
  // empty composer — that is the case dictation exists for.
  const canHoldToDictate =
    dictation?.available === true &&
    !isSendBusy &&
    !isSendDisabled &&
    !isConnecting &&
    !isEnvironmentUnavailable;

  const clearHoldTimer = () => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const endHold = () => {
    clearHoldTimer();
    holdPointerRef.current = null;
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    // The pointerup that ends a hold still fires a click on the submit button.
    suppressClickRef.current = true;
    dictation?.onHoldEnd();
  };

  const handleSendPointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (preserveComposerFocusOnPointerDown) event.preventDefault();
    // A hold released off the button can leave the click it was suppressing
    // unfired; clearing here means that stale flag never eats a real send.
    suppressClickRef.current = false;
    if (!canHoldToDictate || event.button !== 0) return;
    holdPointerRef.current = event.pointerId;
    // Capture so a finger or cursor that drifts off the button still ends the
    // hold here rather than leaving it listening forever.
    event.currentTarget.setPointerCapture(event.pointerId);
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      isHoldingRef.current = true;
      dictation?.onHoldStart();
    }, DICTATION_HOLD_DELAY_MS);
  };

  const handleSendPointerEnd: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (holdPointerRef.current !== event.pointerId) return;
    endHold();
  };

  const handleSendClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }
    // Enabled only so the hold is reachable; a plain click has nothing to send.
    if (!hasSendableContent) event.preventDefault();
  };

  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "px-3" : "px-4")}
          {...pointerFocusProps}
          disabled={
            isEnvironmentUnavailable ||
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
        </Button>
      </div>
    );
  }

  if (isRunning) {
    return (
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs shadow-destructive/24 inset-shadow-[0_1px_--theme(--color-white/16%)] transition-all duration-150 hover:bg-destructive hover:scale-105 active:inset-shadow-[0_1px_--theme(--color-black/8%)] active:shadow-none sm:h-8 sm:w-8"
        {...pointerFocusProps}
        onClick={onInterrupt}
        aria-label="Stop generation"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1.5" />
        </svg>
      </button>
    );
  }

  if (showPlanFollowUpPrompt) {
    if (promptHasText) {
      return (
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "h-9 px-3 sm:h-8" : "h-9 px-4 sm:h-8")}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </Button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <Button
          type="submit"
          size="sm"
          className="h-9 rounded-l-full rounded-r-none px-4 sm:h-8"
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="default"
                className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
                aria-label="Implementation actions"
                {...pointerFocusProps}
                disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top">
            <MenuItem
              disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              onClick={() => void onImplementPlanInNewThread()}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  return (
    <button
      type="submit"
      data-chat-composer-dictation-status={dictation ? dictation.status : undefined}
      // Only set when dictation is switched on but something in this session
      // blocks it, so the user is not left holding a button that does nothing.
      title={
        !canHoldToDictate && dictation?.unavailableMessage
          ? dictation.unavailableMessage
          : undefined
      }
      className={cn(
        // `select-none touch-none` keep a long press on a touch device a hold
        // rather than a text selection or the start of a scroll gesture.
        "relative isolate flex h-9 w-9 touch-none select-none items-center justify-center overflow-hidden rounded-full text-primary-foreground shadow-xs transition-all duration-150 enabled:cursor-pointer enabled:inset-shadow-[0_1px_--theme(--color-white/16%)] hover:scale-105 active:inset-shadow-[0_1px_--theme(--color-black/8%)] active:shadow-none disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none disabled:hover:scale-100 sm:h-8 sm:w-8",
        isDictating
          ? "bg-destructive/90 text-white shadow-destructive/24 hover:bg-destructive"
          : stageBackdropVariant
            ? "bg-transparent enabled:shadow-black/24 enabled:hover:brightness-110"
            : "bg-primary/90 enabled:shadow-primary/24 hover:bg-primary",
      )}
      {...pointerFocusProps}
      onPointerDown={handleSendPointerDown}
      onPointerUp={handleSendPointerEnd}
      onPointerCancel={handleSendPointerEnd}
      // Last resort: capture can be lost without a pointerup, which would
      // otherwise leave the microphone listening with the button already up.
      onLostPointerCapture={handleSendPointerEnd}
      onClick={handleSendClick}
      disabled={
        isSendBusy ||
        isSendDisabled ||
        isConnecting ||
        isEnvironmentUnavailable ||
        (!hasSendableContent && !canHoldToDictate)
      }
      aria-label={
        isEnvironmentUnavailable
          ? "Environment disconnected"
          : sendDisabledReason
            ? sendDisabledReason
            : isConnecting
              ? "Connecting"
              : isPreparingWorktree
                ? "Preparing worktree"
                : isSendBusy
                  ? "Sending"
                  : dictation?.status === "listening"
                    ? "Listening, release to stop"
                    : dictation?.status === "starting"
                      ? "Starting dictation"
                      : dictation?.status === "finishing"
                        ? "Finishing dictation"
                        : canHoldToDictate
                          ? hasSendableContent
                            ? "Send message, or hold to dictate"
                            : "Hold to dictate"
                          : "Send message"
      }
    >
      {stageBackdropVariant && !isDictating ? (
        <span className="absolute inset-0 -z-10" aria-hidden="true">
          <StageBackdropButtonArt variant={stageBackdropVariant} />
        </span>
      ) : null}
      {isConnecting || isSendBusy || dictation?.status === "starting" ? (
        <Spinner className="size-3.5" aria-hidden="true" />
      ) : isDictating ? (
        <MicIcon className="size-3.5" aria-hidden="true" />
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
});
