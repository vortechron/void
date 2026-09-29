import {
  memo,
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";
import { ChevronDownIcon, ChevronLeftIcon, MicIcon } from "lucide-react";
import type { VoiceDictationStatus } from "~/hooks/useVoiceDictation";
import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { StageBackdropButtonArt, useSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { composerFloatingLayerProps } from "./composerEventScope";

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
 *
 * The hold only opens the session. Letting go leaves it listening; the tap
 * that ends it comes later, whenever the user is done talking.
 */
export const DICTATION_HOLD_DELAY_MS = 280;

/**
 * How long the ring that marks the end of a session stays on screen. Long
 * enough to register as a deliberate "that's closed", short enough that it is
 * gone before the user looks back at what they dictated.
 */
const DICTATION_STOP_FLASH_MS = 420;

export interface ComposerDictationControls {
  readonly status: VoiceDictationStatus;
  readonly available: boolean;
  /** Why dictation is not on offer, for the button's label. */
  readonly unavailableMessage: string | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

export type DictationPressIntent = "start-hold" | "stop" | "none";

/**
 * What a press on the send button means for dictation.
 *
 * A press while a session is open always ends it — that is the whole of the
 * toggle — and it wins over every condition that would otherwise turn the
 * button back into a send, so an open microphone always has a way to close.
 */
export function resolveDictationPressIntent(input: {
  isDictating: boolean;
  canHoldToDictate: boolean;
  isPrimaryButton: boolean;
}): DictationPressIntent {
  if (!input.isPrimaryButton) {
    return "none";
  }
  if (input.isDictating) {
    return "stop";
  }
  return input.canHoldToDictate ? "start-hold" : "none";
}

export type DictationControlPlacement = "send-button" | "standalone" | "none";

/**
 * Which control carries the dictation toggle right now.
 *
 * At rest the toggle is a hold on the send button, so the composer keeps a
 * single primary control. The moment that button is gone or has been replaced
 * by something the user must not hit by accident — stop, a pending answer, a
 * plan prompt — the toggle moves out into a button of its own. Talking to a
 * running turn must never mean aiming at interrupt.
 */
export function resolveDictationControlPlacement(input: {
  isDictationAvailable: boolean;
  hasPendingAction: boolean;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
}): DictationControlPlacement {
  if (!input.isDictationAvailable) {
    return "none";
  }
  return input.hasPendingAction || input.isRunning || input.showPlanFollowUpPrompt
    ? "standalone"
    : "send-button";
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
  /** Enter-to-send is disabled on mobile viewports, where stop would otherwise
   * be the only primary action and a running turn could not be steered. */
  showSendWhileRunning?: boolean;
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

// The composer's labeled primary actions (Submit, Refine, Implement) share the send button's
// message-action pill, so they are composer-owned buttons rather than restyled Buttons.
const messageActionPillClassName =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-message-action font-medium text-base text-message-action-foreground shadow-xs shadow-message-action/24 outline-none hover:bg-message-action-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none sm:text-sm";

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
  showSendWhileRunning = false,
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

  // The microphone sits beside stop whenever a turn is running, so the two
  // size off one rule rather than drifting apart on a phone.
  const primaryIconButtonSizeClass = (insidePendingAction: boolean) =>
    insidePendingAction
      ? "size-8 sm:size-7"
      : showSendWhileRunning && hasSendableContent
        ? "size-9 sm:size-8"
        : "size-8";

  const renderStopGenerationButton = (insidePendingAction: boolean) => (
    <button
      type="button"
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs shadow-destructive/24 inset-shadow-2xs inset-shadow-white/16 transition-all duration-150 hover:bg-destructive hover:scale-105 active:inset-shadow-black/8 active:shadow-none",
        primaryIconButtonSizeClass(insidePendingAction),
      )}
      {...pointerFocusProps}
      onClick={onInterrupt}
      aria-label="Stop generation"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="1.5" />
      </svg>
    </button>
  );

  const holdTimerRef = useRef<number | null>(null);
  const pressPointerRef = useRef<number | null>(null);
  const startedDictationRef = useRef(false);
  const suppressClickRef = useRef(false);
  // The button is held but the hold has not counted out yet. Rendered as a
  // ring closing in on the button, so the wait is something the user can watch
  // rather than a press that appears to do nothing for a quarter of a second.
  const [isArming, setIsArming] = useState(false);
  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    },
    [],
  );

  // "polishing" is deliberately not dictating. The microphone is already shut
  // by then and the raw words are already in the composer, so the button goes
  // back to being a send — a user who is happy with what they said should not
  // have to wait out a cleanup pass to send it.
  const isDictating =
    dictation !== null && dictation.status !== "idle" && dictation.status !== "polishing";
  const dictationPlacement = resolveDictationControlPlacement({
    isDictationAvailable: dictation?.available === true,
    hasPendingAction: pendingAction !== null,
    isRunning,
    showPlanFollowUpPrompt,
  });
  // The send button only wears dictation state while it owns the toggle. Once
  // the toggle has moved to a button of its own, it is a plain send again even
  // with a session still open.
  const sendHostsDictation = dictationPlacement === "send-button";
  // Send stays blocked without content, but a hold has to be reachable from an
  // empty composer — that is the case dictation exists for.
  const canHoldToDictate =
    sendHostsDictation &&
    !isSendBusy &&
    !isSendDisabled &&
    !isConnecting &&
    !isEnvironmentUnavailable;

  // A session outlives the press that opened it, so it can still be running
  // once dictation has stopped being offered at all. Rather than leave a
  // microphone open with nothing to close it, the session ends with the offer.
  useEffect(() => {
    if (isDictating && dictationPlacement === "none") dictation?.onStop();
  }, [dictation, dictationPlacement, isDictating]);

  // A session ending is as worth seeing as one starting, and the button losing
  // its colour is easy to miss — so the moment it stops listening it throws
  // off one ring. It keys off "listening" rather than the wider dictating
  // state so the ring lands with the closing sound, not seconds later when the
  // socket finally winds down. The counter only exists to restart the
  // animation when a user opens and closes several sessions in a row.
  const isListening = dictation?.status === "listening";
  const [stopFlashKey, setStopFlashKey] = useState(0);
  const wasListeningRef = useRef(false);
  useEffect(() => {
    if (isListening) {
      wasListeningRef.current = true;
      return;
    }
    if (!wasListeningRef.current) return;
    wasListeningRef.current = false;
    setStopFlashKey((key) => key + 1);
    const timer = window.setTimeout(() => setStopFlashKey(0), DICTATION_STOP_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [isListening]);

  const rendersDictationRings = sendHostsDictation && (isArming || isDictating || stopFlashKey > 0);

  // The toggle in standalone form: one tap opens, one tap closes, no hold to
  // count out. It sits next to stop rather than replacing it, so the red
  // button stays exactly where it was and is never in the way of dictating.
  const renderDictationButton = (sizeClassName: string) => (
    <button
      type="button"
      data-slot="composer-dictation"
      data-chat-composer-dictation-status={dictation ? dictation.status : undefined}
      // Only set when dictation is switched on but something in this session
      // blocks it, so the user is not left tapping a button that does nothing.
      aria-description={dictation?.unavailableMessage ?? undefined}
      className={cn(
        // `select-none touch-none` keep the press a tap on a touch device
        // rather than a text selection or the start of a scroll gesture.
        "relative flex shrink-0 cursor-pointer touch-none select-none items-center justify-center rounded-full border shadow-xs transition-all duration-150 hover:scale-105 active:shadow-none",
        sizeClassName,
        isDictating
          ? "border-destructive bg-destructive/90 text-white shadow-destructive/24 inset-shadow-2xs inset-shadow-white/16 hover:bg-destructive active:inset-shadow-black/8"
          : "border-input bg-popover text-muted-foreground hover:bg-accent/50 hover:text-foreground dark:bg-input/32 dark:hover:bg-input/64",
      )}
      {...pointerFocusProps}
      onClick={() => (isDictating ? dictation?.onStop() : dictation?.onStart())}
      aria-label={
        dictation?.status === "listening"
          ? "Listening, tap to stop"
          : dictation?.status === "starting"
            ? "Starting dictation"
            : dictation?.status === "finishing"
              ? "Finishing dictation"
              : "Dictate"
      }
    >
      {isListening ? (
        <>
          <span className="dictation-listen-ring" aria-hidden="true" />
          <span className="dictation-listen-ring dictation-listen-ring-late" aria-hidden="true" />
        </>
      ) : null}
      {stopFlashKey > 0 ? (
        <span key={stopFlashKey} className="dictation-stop-ring" aria-hidden="true" />
      ) : null}
      {dictation?.status === "starting" ? (
        <Spinner className="size-3.5" aria-hidden="true" />
      ) : (
        <MicIcon
          className={cn("size-3.5", isListening ? "dictation-mic-live" : null)}
          aria-hidden="true"
        />
      )}
    </button>
  );

  const clearHoldTimer = () => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const endPress = () => {
    clearHoldTimer();
    setIsArming(false);
    pressPointerRef.current = null;
    if (!startedDictationRef.current) return;
    startedDictationRef.current = false;
    // Letting go leaves the session listening, so this release is never a send;
    // the pointerup still fires a click on a submit button, and that click has
    // to be swallowed.
    suppressClickRef.current = true;
  };

  const handleSendPointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (preserveComposerFocusOnPointerDown) event.preventDefault();
    // A press released off the button can leave the click it was suppressing
    // unfired; clearing here means that stale flag never eats a real send.
    suppressClickRef.current = false;
    const intent = resolveDictationPressIntent({
      isDictating,
      canHoldToDictate,
      isPrimaryButton: event.button === 0,
    });
    if (intent === "none") return;
    if (intent === "stop") {
      // The tap that closes a session must not also send what it just wrote.
      suppressClickRef.current = true;
      dictation?.onStop();
      return;
    }
    pressPointerRef.current = event.pointerId;
    // Capture so a finger or cursor that drifts off the button still ends the
    // press here rather than leaving the hold timer armed.
    event.currentTarget.setPointerCapture(event.pointerId);
    clearHoldTimer();
    setIsArming(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      startedDictationRef.current = true;
      setIsArming(false);
      dictation?.onStart();
    }, DICTATION_HOLD_DELAY_MS);
  };

  const handleSendPointerEnd: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (pressPointerRef.current !== event.pointerId) return;
    endPress();
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
        {dictationPlacement === "standalone"
          ? renderDictationButton(primaryIconButtonSizeClass(true))
          : null}
        {isRunning ? renderStopGenerationButton(true) : null}
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
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
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-8 sm:h-7", compact ? "px-3" : "px-4")}
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
        </button>
      </div>
    );
  }

  if (showPlanFollowUpPrompt) {
    if (promptHasText) {
      return (
        <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
          {dictationPlacement === "standalone" ? renderDictationButton("size-9 sm:size-8") : null}
          <button
            type="submit"
            className={cn(messageActionPillClassName, "h-9 sm:h-8", compact ? "px-3" : "px-4")}
            {...pointerFocusProps}
            disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
          >
            {isConnecting || isSendBusy ? "Sending..." : "Refine"}
          </button>
        </div>
      );
    }

    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {dictationPlacement === "standalone" ? renderDictationButton("size-9 sm:size-8") : null}
        <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
          <button
            type="submit"
            className={cn(messageActionPillClassName, "h-9 rounded-r-none px-4 sm:h-8")}
            {...pointerFocusProps}
            disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
          >
            {isConnecting || isSendBusy ? "Sending..." : "Implement"}
          </button>
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    messageActionPillClassName,
                    "h-9 rounded-l-none border-l border-message-action-foreground/20 px-2 sm:h-8",
                  )}
                  aria-label="Implementation actions"
                  {...pointerFocusProps}
                  disabled={
                    isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable
                  }
                />
              }
            >
              <ChevronDownIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" side="top" {...composerFloatingLayerProps}>
              <MenuItem
                disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
                onClick={() => void onImplementPlanInNewThread()}
              >
                Implement in a new thread
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>
    );
  }

  // What the send button shows of dictation: nothing at all once the toggle
  // has moved to its own button, so a session opened there never repaints it.
  const sendDictationStatus = sendHostsDictation ? (dictation?.status ?? null) : null;
  const sendIsDictating = sendHostsDictation && isDictating;
  const sendIsListening = sendHostsDictation && isListening;
  const sendStopFlashKey = sendHostsDictation ? stopFlashKey : 0;

  const sendButton = (
    <button
      type="submit"
      data-slot="composer-submit"
      data-chat-composer-dictation-status={sendDictationStatus ?? undefined}
      // Only set when dictation is switched on but something in this session
      // blocks it, so the user is not left holding a button that does nothing.
      aria-description={
        !canHoldToDictate && dictation?.unavailableMessage
          ? dictation.unavailableMessage
          : undefined
      }
      className={cn(
        // `select-none touch-none` keep a long press on a touch device a hold
        // rather than a text selection or the start of a scroll gesture.
        "relative isolate flex h-9 w-9 touch-none select-none items-center justify-center rounded-full shadow-xs transition-all duration-150 enabled:cursor-pointer enabled:inset-shadow-2xs enabled:inset-shadow-white/16 hover:scale-105 active:inset-shadow-black/8 active:shadow-none disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none disabled:hover:scale-100 sm:h-8 sm:w-8",
        // Every dictation ring is drawn outside the button's own circle, so
        // the clip that keeps the backdrop artwork in bounds has to lift while
        // one is on screen.
        rendersDictationRings ? null : "overflow-hidden",
        sendIsDictating
          ? "bg-destructive/90 text-white shadow-destructive/24 hover:bg-destructive"
          : stageBackdropVariant
            ? "bg-transparent text-white enabled:shadow-black/24 enabled:hover:brightness-110"
            : "bg-message-action text-message-action-foreground enabled:shadow-message-action/24 hover:bg-message-action-hover",
        // The squeeze is the first thing that happens on a hold, before the
        // ring has moved at all, so a press never reads as unregistered.
        isArming && "scale-90 hover:scale-90",
      )}
      {...pointerFocusProps}
      onPointerDown={handleSendPointerDown}
      onPointerUp={handleSendPointerEnd}
      onPointerCancel={handleSendPointerEnd}
      // Last resort: capture can be lost without a pointerup, which would
      // otherwise leave the hold timer armed after the button came up.
      onLostPointerCapture={handleSendPointerEnd}
      onClick={handleSendClick}
      disabled={
        // While a session is open this button is the only way to close it, so
        // none of the usual reasons to block a send may take it away.
        !sendIsDictating &&
        (isSendBusy ||
          isSendDisabled ||
          isConnecting ||
          isEnvironmentUnavailable ||
          (!hasSendableContent && !canHoldToDictate))
      }
      aria-label={
        // Dictation states come first: while one is open the button has stopped
        // being a send, so what would have blocked a send no longer describes it.
        sendDictationStatus === "listening"
          ? "Listening, tap to stop"
          : sendDictationStatus === "starting"
            ? "Starting dictation"
            : sendDictationStatus === "finishing"
              ? "Finishing dictation"
              : isEnvironmentUnavailable
                ? "Environment disconnected"
                : sendDisabledReason
                  ? sendDisabledReason
                  : isConnecting
                    ? "Connecting"
                    : isPreparingWorktree
                      ? "Preparing worktree"
                      : isSendBusy
                        ? "Sending"
                        : isRunning
                          ? "Queue message"
                          : canHoldToDictate
                            ? hasSendableContent
                              ? "Send message, or hold to dictate"
                              : "Hold to dictate"
                            : "Send message"
      }
    >
      {stageBackdropVariant && !sendIsDictating ? (
        <span className="absolute inset-0 -z-10 overflow-hidden rounded-full" aria-hidden="true">
          <StageBackdropButtonArt variant={stageBackdropVariant} />
        </span>
      ) : null}
      {isArming ? (
        <span
          className="dictation-arm-ring"
          // The ring lands on the button's edge exactly as the hold counts out,
          // so the two are driven by the same constant.
          style={{ animationDuration: `${DICTATION_HOLD_DELAY_MS}ms` }}
          aria-hidden="true"
        />
      ) : null}
      {sendIsListening ? (
        <>
          <span className="dictation-listen-ring" aria-hidden="true" />
          <span className="dictation-listen-ring dictation-listen-ring-late" aria-hidden="true" />
        </>
      ) : null}
      {sendStopFlashKey > 0 ? (
        <span key={sendStopFlashKey} className="dictation-stop-ring" aria-hidden="true" />
      ) : null}
      {sendDictationStatus === "starting" ? (
        <Spinner size="sm" aria-hidden="true" />
      ) : sendIsDictating ? (
        <MicIcon
          className={cn("size-3.5", sendIsListening ? "dictation-mic-live" : "opacity-70")}
          aria-hidden="true"
        />
      ) : isConnecting || isSendBusy ? (
        <Spinner size="sm" aria-hidden="true" />
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

  if (!isRunning) {
    return sendButton;
  }

  // While a turn runs, a sendable draft queues for the next tool boundary, so
  // the send button stays next to Stop on every viewport.
  return (
    <>
      {dictationPlacement === "standalone"
        ? renderDictationButton(primaryIconButtonSizeClass(false))
        : null}
      {renderStopGenerationButton(false)}
      {hasSendableContent ? sendButton : null}
    </>
  );
});
