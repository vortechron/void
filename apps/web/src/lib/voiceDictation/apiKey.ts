/**
 * The OpenAI key as it was typed, made usable.
 *
 * The settings field is a paste target, and what people have on the clipboard
 * is usually a line out of a `.env` file rather than the key on its own. That
 * matters more here than it would for an HTTP header: this key travels to
 * OpenAI as a WebSocket subprotocol, and a subprotocol is a token, so the `=`
 * in `OPENAI_API_KEY=sk-...` makes `new WebSocket()` throw before the
 * microphone is ever opened.
 */

/** `OPENAI_API_KEY=...`, with or without a leading `export`. */
const ENVIRONMENT_ASSIGNMENT = /^(?:export\s+)?OPENAI_API_KEY\s*=\s*/;
const SURROUNDING_QUOTES = /^(["'])([\s\S]*)\1$/;
/** The token characters a WebSocket subprotocol is limited to (RFC 7230). */
const TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export function normalizeOpenAiApiKey(raw: string): string {
  const withoutAssignment = raw.trim().replace(ENVIRONMENT_ASSIGNMENT, "");
  return withoutAssignment.replace(SURROUNDING_QUOTES, "$2").trim();
}

/**
 * Whether the handshake can carry this key at all. A key that fails here is
 * reported as a settings problem rather than handed to `new WebSocket()`,
 * which would throw a `SyntaxError` the caller can only describe as some
 * unrelated failure.
 */
export function isSendableOpenAiApiKey(key: string): boolean {
  return TOKEN.test(key);
}
