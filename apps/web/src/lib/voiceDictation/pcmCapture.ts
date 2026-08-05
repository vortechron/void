/**
 * Microphone capture for dictation: raw 24 kHz mono PCM16, chunked.
 *
 * The conversion runs in an AudioWorklet rather than on the main thread
 * because the composer is on screen while it runs and a dropped frame there is
 * exactly the kind of thing our users notice. The worklet also does the
 * resampling: `AudioContext({ sampleRate })` normally makes the browser
 * resample the mic for us, but a device that refuses the requested rate would
 * otherwise stream audio the transcription endpoint reads as gibberish, so the
 * processor scales whatever rate it actually got down to 24 kHz itself.
 *
 * Chunks leave the worklet as transferred `ArrayBuffer`s roughly ten times a
 * second — small enough to feel live, large enough that the socket is not
 * woken 190 times a second for 128 frames apiece.
 */
export const DICTATION_SAMPLE_RATE = 24_000;

const CHUNK_SAMPLES = 2_400;
const PROCESSOR_NAME = "t3-dictation-pcm-capture";

const WORKLET_SOURCE = `
class DictationPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${DICTATION_SAMPLE_RATE};
    this.position = 0;
    this.chunk = new Int16Array(${CHUNK_SAMPLES});
    this.filled = 0;
    // The main thread asks for the tail when the hold ends, so the last
    // fraction of a chunk is not dropped mid-word.
    this.port.onmessage = () => {
      this.flush();
      this.port.postMessage(null);
    };
  }

  flush() {
    if (this.filled === 0) return;
    const chunk = this.chunk.slice(0, this.filled);
    this.chunk = new Int16Array(${CHUNK_SAMPLES});
    this.filled = 0;
    this.port.postMessage(chunk.buffer, [chunk.buffer]);
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

    let position = this.position;
    while (position < input.length) {
      const index = Math.floor(position);
      const current = input[index];
      const next = index + 1 < input.length ? input[index + 1] : current;
      const sample = current + (next - current) * (position - index);
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      this.chunk[this.filled] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.filled += 1;
      if (this.filled === this.chunk.length) this.flush();
      position += this.ratio;
    }
    this.position = position - input.length;
    return true;
  }
}

registerProcessor(${JSON.stringify(PROCESSOR_NAME)}, DictationPcmProcessor);
`;

let workletUrl: string | null = null;

function resolveWorkletUrl(): string {
  workletUrl ??= URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
  return workletUrl;
}

export interface PcmCaptureHandle {
  /** Flushes the worklet's partial chunk, then releases the mic. */
  readonly stop: () => Promise<void>;
}

export function canCaptureAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof AudioWorkletNode !== "undefined"
  );
}

export async function startPcmCapture(options: {
  readonly onChunk: (pcm: ArrayBuffer) => void;
}): Promise<PcmCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const context = new AudioContext({ sampleRate: DICTATION_SAMPLE_RATE });
  const release = async () => {
    for (const track of stream.getTracks()) track.stop();
    await context.close().catch(() => {});
  };

  try {
    await context.audioWorklet.addModule(resolveWorkletUrl());
    const source = context.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
    });
    // The worklet writes no output, but a node with nothing downstream is not
    // guaranteed to be pulled by the graph. A muted gain keeps it processing
    // without putting the microphone back through the speakers.
    const mute = context.createGain();
    mute.gain.value = 0;

    let onFlushed: (() => void) | null = null;
    const handleWorkletMessage = (event: MessageEvent<ArrayBuffer | null>) => {
      if (event.data === null) {
        onFlushed?.();
        return;
      }
      options.onChunk(event.data);
    };
    processor.port.addEventListener("message", handleWorkletMessage);
    // `addEventListener` on a MessagePort does not imply `start()`, unlike
    // assigning `onmessage`, so nothing would be delivered without this.
    processor.port.start();
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);

    return {
      stop: async () => {
        // Wait for the tail chunk, but never let a wedged worklet hold the mic.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 200);
          onFlushed = () => {
            clearTimeout(timer);
            resolve();
          };
          // oxlint-disable-next-line unicorn/require-post-message-target-origin
          processor.port.postMessage("flush");
        });
        processor.port.removeEventListener("message", handleWorkletMessage);
        source.disconnect();
        processor.disconnect();
        mute.disconnect();
        await release();
      },
    };
  } catch (error) {
    await release();
    throw error;
  }
}
