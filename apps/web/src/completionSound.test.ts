import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  __resetCompletionSoundForTests,
  playCompletionSound,
  prepareCompletionSound,
} from "./completionSound";

afterEach(() => {
  __resetCompletionSoundForTests();
  vi.unstubAllGlobals();
});

function installAudioContext(initialState: AudioContextState = "running") {
  const starts: number[] = [];
  const stops: number[] = [];
  const frequencies: number[] = [];
  const resume = vi.fn(async () => {
    context.state = "running";
  });
  const context = {
    state: initialState,
    currentTime: 5,
    destination: {},
    resume,
    createOscillator: () => ({
      type: "sine",
      frequency: {
        setValueAtTime: (frequency: number) => frequencies.push(frequency),
      },
      connect: vi.fn(),
      start: (at: number) => starts.push(at),
      stop: (at: number) => stops.push(at),
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  };
  const AudioContext = vi.fn(function AudioContext() {
    return context;
  });
  vi.stubGlobal("window", { AudioContext });

  return { AudioContext, context, frequencies, resume, starts, stops };
}

describe("completion sound", () => {
  it("does not create an audio context when the sound is disabled", async () => {
    const { AudioContext } = installAudioContext();

    await expect(playCompletionSound("none")).resolves.toBe(false);
    expect(AudioContext).not.toHaveBeenCalled();
  });

  it("plays the two-note chime", async () => {
    const { frequencies, starts, stops } = installAudioContext();

    await expect(playCompletionSound("chime")).resolves.toBe(true);
    expect(frequencies).toEqual([659.25, 987.77]);
    expect(starts).toHaveLength(2);
    expect(stops).toHaveLength(2);
  });

  it("resumes suspended audio during a user interaction", async () => {
    const { resume } = installAudioContext("suspended");

    await expect(prepareCompletionSound()).resolves.toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
