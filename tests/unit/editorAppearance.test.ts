// @vitest-environment happy-dom
import { Compartment } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { editorAppearance, isValidEditorSpacing } from "cm/editorAppearance";
import { afterEach, describe, expect, it } from "vitest";

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});
function create(doc: string, settings = {}) {
  const compartment = new Compartment();
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      lineNumbers(),
      EditorView.theme({
        "&": { backgroundColor: "#112233", color: "#445566" },
      }),
      compartment.of(editorAppearance(settings)),
    ],
  });
  views.push(view);
  return { view, compartment };
}

describe("editor appearance", () => {
  it("applies and clears color/padding overrides without losing the document", () => {
    const { view, compartment } = create("alpha\nbeta", {
      editorBackgroundColor: "#ffffff",
      editorForegroundColor: "#000000",
      editorPaddingLeft: 0,
      editorPaddingRight: 24,
    });
    expect(getComputedStyle(view.dom).backgroundColor).toBe("#ffffff");
    expect(getComputedStyle(view.contentDOM).color).toBe("#000000");
    expect(getComputedStyle(view.contentDOM).paddingLeft).toBe("0px");
    expect(getComputedStyle(view.contentDOM).paddingRight).toBe("24px");
    view.dispatch({ effects: compartment.reconfigure(editorAppearance({})) });
    expect(getComputedStyle(view.dom).backgroundColor).toBe("#112233");
    expect(getComputedStyle(view.dom).color).toBe("#445566");
    // happy-dom does not invalidate descendant style caches when an ancestor
    // theme class changes. Refresh that cache; Chromium also verifies reset.
    view.contentDOM.setAttribute("data-theme-updated", "true");
    expect(getComputedStyle(view.contentDOM).paddingRight).toBe("0px");
    expect(view.state.doc.toString()).toBe("alpha\nbeta");
  });
  it("adds spacing after hard line breaks with or without blank separators", () => {
    const { view, compartment } = create("\nfirst\nline\n\n\nsecond\nlast", {
      editorParagraphSpacing: 18,
    });
    const paddedLines = () =>
      [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")]
        .filter((line) => line.style.paddingTop === "18px")
        .map((line) => line.textContent);
    expect(paddedLines()).toEqual(["line", "second", "last"]);
    const doc = view.state.doc.toString();
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "first\nsecond" },
    });
    expect(paddedLines()).toEqual(["second"]);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
    });
    view.dispatch({
      effects: compartment.reconfigure(
        editorAppearance({ editorParagraphSpacing: 40 }),
      ),
    });
    expect(
      [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")]
        .filter((line) => line.style.paddingTop === "40px")
        .map((line) => line.textContent),
    ).toEqual(["line", "second", "last"]);
    view.dispatch({
      effects: compartment.reconfigure(
        editorAppearance({ editorParagraphSpacing: 0 }),
      ),
    });
    expect(paddedLines()).toEqual([]);
    expect(view.state.doc.toString()).toBe(doc);
  });
  it("applies global appearance independently to multiple panes", () => {
    for (let n = 0; n < 2; n++) {
      const { view, compartment } = create("pane");
      view.dispatch({
        effects: compartment.reconfigure(
          editorAppearance({ editorPaddingLeft: 12 }),
        ),
      });
      expect(getComputedStyle(view.contentDOM).paddingLeft).toBe("12px");
    }
  });
  it("rejects invalid values instead of inserting arbitrary CSS", () => {
    for (const value of [0, "0", 12.5, 80])
      expect(isValidEditorSpacing(value)).toBe(true);
    for (const value of [-1, 81, Infinity, null, "", " ", "4px"])
      expect(isValidEditorSpacing(value)).toBe(false);
    const { view } = create("text", {
      editorBackgroundColor: "invalid",
      editorPaddingLeft: -1,
    });
    expect(getComputedStyle(view.dom).backgroundColor).toBe("#112233");
  });
});
