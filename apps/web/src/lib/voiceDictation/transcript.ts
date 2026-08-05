/**
 * Assembles the text OpenAI streams back during a dictation hold.
 *
 * The realtime endpoint reports transcription per conversation item: a run of
 * `delta` events that append text, then a `completed` event carrying that
 * item's final transcript, which can differ from the concatenated deltas once
 * the model has heard the whole phrase. A long hold can produce several items,
 * so the accumulator keeps them in arrival order and re-renders the whole
 * string on every change — the composer replaces its dictated span outright,
 * so a late correction lands without leaving stale words behind.
 */
export interface TranscriptSegment {
  readonly itemId: string;
  readonly delta: string;
  readonly final: string | null;
}

export interface TranscriptState {
  readonly segments: ReadonlyArray<TranscriptSegment>;
}

export const emptyTranscript: TranscriptState = { segments: [] };

function upsertSegment(
  state: TranscriptState,
  itemId: string,
  update: (segment: TranscriptSegment) => TranscriptSegment,
): TranscriptState {
  const existing = state.segments.find((segment) => segment.itemId === itemId);
  if (!existing) {
    return { segments: [...state.segments, update({ itemId, delta: "", final: null })] };
  }
  return {
    segments: state.segments.map((segment) =>
      segment.itemId === itemId ? update(segment) : segment,
    ),
  };
}

export function appendTranscriptDelta(
  state: TranscriptState,
  itemId: string,
  delta: string,
): TranscriptState {
  if (delta.length === 0) return state;
  return upsertSegment(state, itemId, (segment) => ({
    ...segment,
    // A completed item never grows again; a stray late delta would otherwise
    // duplicate text the final transcript already contains.
    delta: segment.final === null ? segment.delta + delta : segment.delta,
  }));
}

export function completeTranscriptItem(
  state: TranscriptState,
  itemId: string,
  transcript: string,
): TranscriptState {
  return upsertSegment(state, itemId, (segment) => ({ ...segment, final: transcript }));
}

/** The dictated text as it should currently read in the composer. */
export function renderTranscript(state: TranscriptState): string {
  return state.segments
    .map((segment) => (segment.final ?? segment.delta).trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

/** True once every item that has been seen has reported its final transcript. */
export function isTranscriptSettled(state: TranscriptState): boolean {
  return state.segments.every((segment) => segment.final !== null);
}
