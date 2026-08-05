# Voice dictation

Hold the send button in the chat box to talk instead of type. Your words appear in the composer
while you are still speaking; release the button and the text stays there for you to edit and send.

Dictation uses your own OpenAI key. Audio streams to OpenAI as you speak and is never written to a
file, so there is no recording to manage or delete.

## Turn it on

1. Open **Settings → General → Voice dictation**.
2. Switch it on.
3. Paste an OpenAI API key.

The key is stored with the rest of that environment's settings and is shared with every client
paired to it, because the client you are talking into is what connects to OpenAI.

## Using it

Press and hold the send button for a moment. It turns red and shows a microphone while it is
listening. Release to stop. If the composer already had text, the dictated words are added to the
end of it.

A quick click still sends the message as usual — only a held press starts listening.

## Options

- **Model** — _Live transcribe_ writes words as you say them. _Transcribe_ waits until you release
  the button, and is worth trying if live results come back wrong.
- **Language** — a two-letter code such as `en` or `ms`. Leave it blank and the model works out
  what it is hearing.

## When the button will not listen

- **Voice dictation needs an HTTPS or localhost connection.** Browsers refuse microphone access on
  a plain HTTP page, so a remote client reached over `http://` cannot dictate. Reach the server
  over HTTPS, over a tunnel, or use the desktop app.
- **The first hold asks for microphone permission.** If you dismissed that prompt, allow the
  microphone for this site in your browser's settings.
- **Dictation is not offered while an agent is running**, because the send button is a stop button
  then. Wait for the turn to finish, or start a new message first.

Voice dictation is available in the web and desktop apps. The mobile app does not have it yet.
