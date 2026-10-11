// @vitest-environment happy-dom

import { Compartment } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { editorFontTheme, isValidEditorLineHeight } from "cm/editorFontTheme";
import { afterEach, describe, expect, it } from "vitest";

let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  document.body.replaceChildren();
});

describe("editor line height", () => {
  it("overrides CodeMirror's scroller default and updates without losing text or selection", () => {
    const font = new Compartment();
    view = new EditorView({
      doc: "first\nsecond",
      selection: { anchor: 3 },
      extensions: [
        lineNumbers(),
        font.of(editorFontTheme("12px", "monospace", 1)),
      ],
      parent: document.body,
    });
    expect(getComputedStyle(view.scrollDOM).lineHeight).toBe("1");
    for (const height of [2, 2.5, 4]) {
      view.dispatch({
        effects: font.reconfigure(editorFontTheme("12px", "monospace", height)),
      });
      expect(getComputedStyle(view.scrollDOM).lineHeight).toBe(String(height));
      expect(view.state.doc.toString()).toBe("first\nsecond");
      expect(view.state.selection.main.anchor).toBe(3);
    }
  });

  it("accepts decimal multipliers above two and rejects invalid settings", () => {
    for (const value of [1, 2, 2.5, 4, "3.5"])
      expect(isValidEditorLineHeight(value)).toBe(true);
    for (const value of [0, 0.9, 4.1, NaN, Infinity, "2px", "", null, true])
      expect(isValidEditorLineHeight(value)).toBe(false);
  });
});
