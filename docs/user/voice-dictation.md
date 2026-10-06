# Voice dictation

Hold the send button in the chat box to talk instead of type. Your words appear in the composer
while you are still speaking; release the button and the text stays there for you to edit and send.

Dictation uses your own OpenAI key. Audio streams to OpenAI as you speak and is never written to a
file, so there is no recording to manage or delete.

## Turn it on

1. Open **Settings → Voice**.
2. Switch **Voice dictation** on.
3. Paste an OpenAI API key.

The key is stored with the rest of that environment's settings and is shared with every client
paired to it, because the client you are talking into is what connects to OpenAI.

## Using it

Press and hold the send button for a moment. It turns red and shows a microphone while it is
listening. Release to stop. If the composer already had text, the dictated words are added to the
end of it.

A quick click still sends the message as usual — only a held press starts listening.

## Cleaning up what you said

Speech is not writing. It arrives with "um", with false starts, and with no punctuation, and you
correct yourself halfway through a sentence expecting the correction to win. Once you stop talking,
a cleanup pass rewrites the dictated words in place to read as what you meant to type.

> "um so I need you to rename the file, no wait, the folder, uh, to assets"

becomes

> "Rename the folder to assets."

It happens on its own — there is no extra button — and **⌘Z puts your raw words back** if you
preferred them. If the pass cannot run, the raw transcript simply stays where it is.

- **Cleanup style** — _Clean up_ fixes punctuation, drops filler, and applies corrections you said
  out loud, keeping your own words otherwise. _Rewrite_ also tightens rambling into clear sentences.
  _Off_ leaves the transcript exactly as heard.
- **Cleanup instructions** — anything else the pass should know, such as a house style or a spelling
  convention. Most people leave this blank.
- **Cleanup model** — the OpenAI model the pass runs on. The default is a small fast one, which is
  what this wants. Change it only if OpenAI renames it.

The pass never answers your text or acts on it, and it leaves file paths, URLs, email addresses,
commands and anything in backticks exactly as they were.

## Dictionary

Add the names, jargon and product words you say often, and dictation stops guessing at their
spelling. Terms are sent to the transcription model as a hint so it hears them correctly, and again
to the cleanup pass so anything that slipped through is still fixed.

## Snippets

Text you would rather not dictate letter by letter — an address, a link, a prompt you reuse. Save a
spoken phrase and the text it stands for, then say the phrase while dictating:

> say "my email" → `hello@example.com`

The phrase is matched whole and ignores capitalisation. Snippets are plain text replacement, so they
work even with the cleanup style set to _Off_.

## Options

- **Model** — _Live transcribe_ writes words as you say them. _Transcribe_ waits until you release
  the button, and is worth trying if live results come back wrong.
- **Dictation languages** — language codes separated by commas. Use `en, ms` for English and
  Malay, including when you mix them in one sentence. Leave it blank for automatic detection.

## When the button will not listen

- **Voice dictation needs an HTTPS or localhost connection.** Browsers refuse microphone access on
  a plain HTTP page, so a remote client reached over `http://` cannot dictate. Reach the server
  over HTTPS, over a tunnel, or use the desktop app.
- **The first hold asks for microphone permission.** If you dismissed that prompt, allow the
  microphone for this site in your browser's settings.
- **Dictation is not offered while an agent is running**, because the send button is a stop button
  then. Wait for the turn to finish, or start a new message first.

Voice dictation is available in the web and desktop apps. The mobile app does not have it yet.
