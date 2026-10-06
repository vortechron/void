import { describe, expect, it } from "vite-plus/test";

import { parseDictationLanguages } from "./languages";

describe("dictation language hints", () => {
  it.each([
    ["", []],
    [" ,  ", []],
    ["ms", ["ms"]],
    [" EN, ms, en ", ["en", "ms"]],
    ["en ms\nfr", ["en", "ms", "fr"]],
    ["eng, zh-CN, yue", ["eng", "zh-cn", "yue"]],
  ] as const)("reads %j", (value, expected) => {
    expect(parseDictationLanguages(value)).toEqual(expected);
  });
});
