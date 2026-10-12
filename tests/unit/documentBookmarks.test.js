// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import documentBookmarks, { bookmarkExcerpt, bookmarkScrollPosition, createBookmarkStore } from "components/documentBookmarks";

let active;
afterEach(() => {
  active?.close(); active = null;
  document.body.replaceChildren();
  localStorage.clear();
});
const makeStorage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};
function setup(storage = makeStorage()) {
  const doc = "甲乙丙丁戊己庚辛壬癸".repeat(20);
  const file = { id: "test", uri: "content://document/a.txt", loaded: true, type: "editor" };
  const view = { state: EditorState.create({ doc, selection: { anchor: 60 } }), dispatch: vi.fn(), focus: vi.fn() };
  view.scrollDOM = document.createElement("div");
  view.posAtCoords = () => 60;
  const handlers = new Map();
  const manager = { activeFile: file, getFilePane: () => ({ editor: view }), on: (name, handler) => handlers.set(name, handler) };
  active = documentBookmarks({ manager, labels: {}, storage });
  active.update();
  const click = (label, scope = active.overlay) => [...scope.querySelectorAll("button")].find((button) => button.textContent === label).click();
  return { controller: active, file, view, manager, handlers, click, storage, doc };
}

describe("document bookmarks", () => {
  it("anchors to the scrollbar thumb center rather than the viewport top", () => {
    const { controller, manager, view, file } = setup();
    view.scrollDOM.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0 });
    manager.getBookmarkScrollbarPoint = () => 100;
    view.posAtCoords = ({ y }) => y;
    controller.add();
    expect(controller.store.list(file.uri)[0].position).toBe(100);
  });
  it("uses the scroll position rather than the cursor in either editor mode", () => {
    const { controller, view, file, doc } = setup();
    view.posAtCoords = () => 120;
    for (const readOnly of [true, false]) {
      view.state = EditorState.create({ doc, selection: { anchor: 5 }, extensions: [EditorState.readOnly.of(readOnly)] });
      controller.add();
    }
    expect(controller.store.list(file.uri).map((item) => item.position)).toEqual([120, 120]);
    view.posAtCoords = () => null;
    view.documentTop = -40;
    view.lineBlockAtHeight = (height) => ({ from: height });
    expect(bookmarkScrollPosition(view)).toBe(40);
  });
  it("takes about thirty Unicode characters around the cursor, including both document edges", () => {
    const text = "读📚".repeat(40);
    for (const position of [0, 30, text.length]) expect(Array.from(bookmarkExcerpt(text, position))).toHaveLength(30);
    expect(bookmarkExcerpt("短文", 1)).toBe("短文");
  });
  it("persists per document, sorts by position, and enforces a fifty-character edit limit", () => {
    const storage = makeStorage(), store = createBookmarkStore(storage);
    const later = store.add("a", "字".repeat(100), 80);
    const earlier = store.add("a", "字".repeat(100), 20);
    expect(store.list("a").map((item) => item.id)).toEqual([earlier.id, later.id]);
    expect(createBookmarkStore(storage).list("a")).toHaveLength(2);
    expect(store.list("b")).toHaveLength(0);
    store.edit("a", earlier.id, "📚".repeat(50));
    expect(Array.from(store.list("a")[0].text)).toHaveLength(50);
    expect(() => store.edit("a", earlier.id, "字".repeat(51))).toThrow(/50/);
  });
  it("maps positions through edits and transfers bookmarks on rename", () => {
    const { controller, file, view, handlers } = setup();
    controller.add();
    const change = view.state.update({ changes: { from: 0, insert: "前言" } });
    handlers.get("bookmark-document-changed")(file, change.changes);
    expect(controller.store.list(file.uri)[0].position).toBe(62);
    const previous = file.uri;
    file.uri = "content://document/renamed.txt";
    handlers.get("rename-file")(file);
    expect(controller.store.list(previous)).toHaveLength(0);
    expect(controller.store.list(file.uri)[0].position).toBe(62);
  });
  it("adds at the cursor, renders time above text, and navigates without editing the document", () => {
    const { controller, file, view } = setup();
    controller.add();
    const item = controller.store.list(file.uri)[0];
    expect(item.position).toBe(60);
    const row = controller.overlay.querySelector(".editor-bookmark-row");
    expect(row.firstElementChild.tagName).toBe("TIME");
    row.querySelector(".editor-bookmark-excerpt").click();
    expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({ selection: { anchor: 60 } }));
    expect(view.state.doc.toString()).toBe("甲乙丙丁戊己庚辛壬癸".repeat(20));
  });
  it("requires confirmation when all selected bookmarks are deleted and preserves cancellation", async () => {
    const { controller, file, click } = setup();
    controller.add(); controller.add();
    click("全选");
    expect([...controller.overlay.querySelectorAll("input[type=checkbox]")].every((input) => input.checked)).toBe(true);
    click("删除", controller.overlay.querySelector("footer"));
    expect(controller.overlay.querySelector('[role="alertdialog"]')).not.toBeNull();
    click("取消", controller.overlay.querySelector('[role="alertdialog"]'));
    await Promise.resolve();
    expect(controller.store.list(file.uri)).toHaveLength(2);
    click("删除", controller.overlay.querySelector("footer"));
    click("删除", controller.overlay.querySelector('[role="alertdialog"]'));
    await Promise.resolve();
    expect(controller.store.list(file.uri)).toHaveLength(0);
  });
  it("deletes only selected rows and resets selection after outside dismissal", () => {
    const { controller, file, click } = setup();
    controller.add(); controller.add(); controller.add();
    click("选择");
    const checkbox = controller.overlay.querySelector("input[type=checkbox]");
    checkbox.checked = true; checkbox.dispatchEvent(new Event("change"));
    click("删除", controller.overlay.querySelector("footer"));
    expect(controller.store.list(file.uri)).toHaveLength(2);
    expect(controller.overlay.querySelector('[role="alertdialog"]')).toBeNull();
    click("全选");
    controller.overlay.click(); controller.overlay.click();
    controller.open();
    expect(controller.overlay.querySelector("input[type=checkbox]")).toBeNull();
    expect(controller.overlay.querySelector("footer button").disabled).toBe(true);
  });
  it("edits only the label, rejects overlong drafts and cancels drafts when closed", () => {
    const { controller, file, click, view } = setup();
    controller.add();
    controller.overlay.querySelector(".editor-bookmark-options").click();
    click("编辑");
    const input = controller.overlay.querySelector("textarea");
    input.value = "字".repeat(51); input.dispatchEvent(new Event("input"));
    const save = [...controller.overlay.querySelectorAll("button")].find((button) => button.textContent === "保存");
    expect(save.disabled).toBe(true);
    input.value = "自定义书签"; input.dispatchEvent(new Event("input"));
    save.click();
    expect(controller.store.list(file.uri)[0].text).toBe("自定义书签");
    expect(view.dispatch).not.toHaveBeenCalled();
    controller.overlay.querySelector(".editor-bookmark-options").click(); click("编辑");
    controller.overlay.querySelector("textarea").value = "未保存";
    controller.overlay.click(); controller.overlay.click(); controller.open();
    expect(controller.store.list(file.uri)[0].text).toBe("自定义书签");
  });
  it("does not delete after an outside click dismisses the all-delete confirmation", async () => {
    const { controller, file, click } = setup();
    controller.add(); click("全选"); click("删除", controller.overlay.querySelector("footer"));
    controller.overlay.querySelector(".editor-bookmark-confirm-overlay").click();
    await Promise.resolve();
    expect(controller.store.list(file.uri)).toHaveLength(1);
  });
});
