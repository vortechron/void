export function shouldReuseRacedDraftAfterDefaults(input: {
  readonly forceNew: boolean;
  readonly hasPromotedThread: boolean;
}): boolean {
  return !input.forceNew && !input.hasPromotedThread;
}
