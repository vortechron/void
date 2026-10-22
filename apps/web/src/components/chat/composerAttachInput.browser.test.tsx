import { useRef, useState } from "react";
import { expect, it } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { ComposerAttachButton, ComposerAttachInput } from "./ComposerAttachmentStrip";

// Stands in for ChatComposer at phone width: the footer that holds the attach
// button unmounts when the composer collapses, and opening the system picker
// is what blurs the editor and collapses it. The input sits at the root, as it
// does in the composer.
function PhoneComposer(props: { collapsed: boolean; picked: File[][] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form>
      <ComposerAttachInput inputRef={inputRef} onPick={(files) => props.picked.push(files)} />
      {props.collapsed ? null : (
        <div data-footer>
          <ComposerAttachButton inputRef={inputRef} />
        </div>
      )}
    </form>
  );
}

function pick(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

it("delivers a file picked after the phone composer collapsed", async () => {
  const picked: File[][] = [];
  await using screen = await render(<PhoneComposer collapsed={false} picked={picked} />, {
    router: false,
  });
  const input = screen.container.querySelector<HTMLInputElement>('input[type="file"]')!;

  await screen.rerender(<PhoneComposer collapsed picked={picked} />);
  expect(screen.container.querySelector("[data-footer]")).toBeNull();

  await act(() => pick(input, new File(["hello"], "photo.png", { type: "image/png" })));

  expect(input.isConnected).toBe(true);
  expect(picked.map((files) => files.map((file) => file.name))).toEqual([["photo.png"]]);
});

it("clears the input so picking the same file again still reports it", async () => {
  const picked: File[][] = [];
  function Harness() {
    const [collapsed] = useState(true);
    return <PhoneComposer collapsed={collapsed} picked={picked} />;
  }
  await using screen = await render(<Harness />, { router: false });
  const input = screen.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["hello"], "photo.png", { type: "image/png" });

  await act(() => pick(input, file));
  expect(input.value).toBe("");
  await act(() => pick(input, file));

  expect(picked).toHaveLength(2);
});
