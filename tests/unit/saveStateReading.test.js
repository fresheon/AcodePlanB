// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("cm/editorUtils", () => ({ getAllFolds: () => [], getSelection: () => null, getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }) }));
vi.mock("lib/config", () => ({ default: { DEFAULT_FILE_SESSION: "default" } }));
vi.mock("lib/openFolder", () => ({ addedFolder: [] }));
vi.mock("lib/settings", () => ({ default: { value: { rememberFiles: false, rememberFolders: false } } }));
import saveState from "lib/saveState";
describe("reading session snapshots", () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    window.editorManager = { editor: {}, files: [], activeFile: null };
  });
  it("never replaces the previous session with the partial startup file list", () => {
    localStorage.setItem("files", JSON.stringify([{ id: "saved" }]));
    sessionStorage.setItem("isfilesRestored", "false");
    saveState();
    expect(JSON.parse(localStorage.getItem("files"))).toEqual([{ id: "saved" }]);
  });
  it("remembers all documents read-only, including unloaded inactive positions", () => {
    sessionStorage.setItem("isfilesRestored", "true");
    window.editorManager.files = [{ id: "one", type: "editor", filename: "one.txt", uri: "file:///one.txt", loaded: false, editable: true,
      lastScrollTop: 500, readingPosition: { from: 80, offset: -3, left: 0 } },
      { id: "two", type: "editor", filename: "two.txt", loaded: false, editable: true }];
    saveState();
    const files = JSON.parse(localStorage.getItem("files"));
    expect(files).toHaveLength(2); expect(files.every(f => f.editable === false)).toBe(true);
    expect(files[0].readingPosition).toEqual({ from: 80, offset: -3, left: 0 });
  });
  it("keeps the second loaded document's position when the first document is active at shutdown", () => {
    sessionStorage.setItem("isfilesRestored", "true");
    const one = { id: "one", type: "editor", loaded: true, readingPosition: { from: 80, offset: -2, left: 0 } };
    const two = { id: "two", type: "editor", loaded: true, lastScrollTop: 800, readingPosition: { from: 140, offset: -3, left: 0 } };
    window.editorManager.files = [one, two]; window.editorManager.activeFile = one;
    saveState();
    const files = JSON.parse(localStorage.getItem("files"));
    expect(files[1].readingPosition).toEqual(two.readingPosition);
    expect(files[1].scrollTop).toBe(800);
    expect(files[1].render).toBe(false);
  });

});
