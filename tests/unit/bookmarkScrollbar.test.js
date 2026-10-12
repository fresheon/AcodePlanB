// @vitest-environment happy-dom
import ScrollBar from "components/scrollbar";
import { expect, it } from "vitest";

it("retains the thumb center point when the scrollbar is hidden and detached", () => {
  const parent = document.createElement("div");
  document.body.append(parent);
  const bar = ScrollBar({ parent, thumbHeight: 50 });
  try {
    bar.getBoundingClientRect = () => ({ top: 80, left: 0, height: 300, width: 40 });
    bar.querySelector(".container").getBoundingClientRect = () => ({ top: 90, left: 10 });
    bar.value = 0.5;
    expect(bar.bookmarkPoint).toBe(205);
    expect(bar.isConnected).toBe(false);
    bar.show();
    expect(bar.bookmarkPoint).toBe(205);
    bar.hideImmediately();
    expect(bar.bookmarkPoint).toBe(205);
    expect(bar.isConnected).toBe(false);
  } finally { bar.destroy(); parent.remove(); }
});
