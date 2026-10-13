// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureReadingPosition, persistReadingPosition, savedReadingPosition, forgetReadingPosition, restoreReadingPosition } from "lib/readingSession";
import { EditorState } from "@codemirror/state";
function viewAt(from = 80, offset = -3) {
  const dom = document.createElement("div"); document.body.append(dom);
  dom.getBoundingClientRect = () => ({ top: 50, left: 0, right: 300, width: 300, height: 400 });
  dom.scrollTop = 500; dom.scrollLeft = 0;
  return { state: EditorState.create({ doc: "字".repeat(200) }), scrollDOM: dom, contentDOM: dom,
    documentTop: -450, lineBlockAt: () => ({ top: 497 }), posAtCoords: () => from, coordsAtPos: () => ({ top: 50 + offset }), dispatch: vi.fn(), requestMeasure: vi.fn() };
}
describe("durable reading sessions", () => {
  beforeEach(() => { localStorage.clear(); document.body.replaceChildren(); });
  it("persists two independent positions without any shutdown callback", () => {
    const one = { id: "one", uri: "file:///one.txt", type: "editor", loaded: true };
    const two = { id: "two", uri: "file:///two.txt", type: "editor", loaded: true };
    localStorage.setItem("files", JSON.stringify([one, two]));
    persistReadingPosition(one, viewAt(80)); persistReadingPosition(two, viewAt(120, 2));
    expect(savedReadingPosition({ id: "one", uri: one.uri })).toEqual({ from: 80, offset: -3, left: 0 });
    expect(savedReadingPosition({ id: "two", uri: two.uri })).toEqual({ from: 120, offset: 2, left: 0 });
    expect(JSON.parse(localStorage.getItem("files")).map(f => f.readingPosition.from)).toEqual([80, 120]);
  });
  it("uses an inactive file's complete snapshot instead of an older first-page journal", () => {
    const file = { id: "two", uri: "file:///two.txt", readingPosition: { from: 120, offset: -3, left: 0 } };
    localStorage.setItem("acode-reading-positions-v1", JSON.stringify({ two: { uri: file.uri, position: { from: 0, offset: 0, left: 0 } } }));
    expect(savedReadingPosition(file)).toEqual(file.readingPosition);
  });
  it("does not attribute a shared view's previous document to the selected file", () => {
    const file = { id: "two", type: "editor", loaded: true, session: EditorState.create({ doc: "other document" }), readingPosition: { from: 4, offset: 0, left: 0 } };
    persistReadingPosition(file, viewAt(80));
    expect(file.readingPosition.from).toBe(4);
    expect(localStorage.getItem("acode-reading-positions-v1")).toBeNull();
  });
  it("does not recapture a restored viewport on synthetic scroll or repeated tab switches", () => {
    const view = viewAt(80); const file = { id: "two", type: "editor", loaded: true, readingPosition: { from: 120, offset: -3, left: 0 } };
    view.__readingPositionRestored = { fileId: file.id, top: view.scrollDOM.scrollTop, left: 0 };
    persistReadingPosition(file, view);
    expect(file.readingPosition.from).toBe(120);
    view.scrollDOM.scrollTop += 20;
    persistReadingPosition(file, view);
    expect(file.readingPosition.from).toBe(80);
  });
  it("forgets a manually closed document and rejects a changed URI", () => {
    const file = { id: "one", uri: "file:///one.txt", type: "editor", loaded: true };
    persistReadingPosition(file, viewAt());
    expect(savedReadingPosition({ id: file.id, uri: "file:///moved.txt" })).toBeNull();
    forgetReadingPosition(file);
    expect(savedReadingPosition({ id: file.id, uri: file.uri })).toBeNull();
  });
  it("does not overwrite an unloaded tab or a pending restoration with the loading viewport", () => {
    const file = { id: "one", uri: "file:///one.txt", type: "editor", loaded: true };
    persistReadingPosition(file, viewAt());
    file.__readingRestorePending = true;
    persistReadingPosition(file, viewAt(0));
    file.__readingRestorePending = false; file.loaded = false;
    persistReadingPosition(file, viewAt(0));
    expect(savedReadingPosition(file).from).toBe(80);
  });
  it("restores a text anchor with its viewport offset and can cancel when the user switches tabs", () => {
    const view = viewAt(80, 12);
    const file = { readingPosition: { from: 80, offset: -3, left: 4 } };
    const stop = restoreReadingPosition(view, file, () => true);
    expect(file.__readingRestorePending).toBe(true);
    let measure = view.requestMeasure.mock.calls[0][0]; measure.write(measure.read());
    expect(view.scrollDOM.scrollTop).toBe(515); expect(view.scrollDOM.scrollLeft).toBe(4);
    stop(); measure = view.requestMeasure.mock.calls.at(-1)[0]; measure.write(measure.read());
    expect(file.__readingRestorePending).toBe(false); expect(view.scrollDOM.scrollTop).toBe(515);
  });
  it("a cancelled restore cannot release the guard of a newer restore", () => {
    const view = viewAt();
    const file = { readingPosition: { from: 80, offset: -3, left: 0 } };
    const stopOld = restoreReadingPosition(view, file, () => true);
    const oldMeasure = view.requestMeasure.mock.calls[0][0];
    stopOld();
    const stopNew = restoreReadingPosition(view, file, () => true);
    oldMeasure.write(oldMeasure.read());
    expect(file.__readingRestorePending).toBe(true);
    stopNew();
  });
  it("preserves the last measured anchor while layout is unavailable during an editor update", () => {
    const file = { id: "one", type: "editor", loaded: true };
    const view = viewAt(); persistReadingPosition(file, view);
    view.coordsAtPos = () => { throw new Error("Reading layout during update"); };
    persistReadingPosition(file, view);
    expect(savedReadingPosition(file).from).toBe(80);
  });
  it("ignores hidden editors rather than replacing their saved positions", () => {
    const view = viewAt(); view.scrollDOM.getBoundingClientRect = () => ({ height: 0, width: 0 });
    expect(captureReadingPosition(view)).toBeNull();
  });
});
