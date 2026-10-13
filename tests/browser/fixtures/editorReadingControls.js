import { Compartment, EditorState } from "@codemirror/state";
import {
	EditorView,
	drawSelection,
	highlightActiveLine,
	lineNumbers,
} from "@codemirror/view";
import {
	createEditorReadOnlyExtension,
	reconfigureEditorReadOnly,
} from "../../../src/cm/editorReadOnly.ts";
import { editorAppearance } from "../../../src/cm/editorAppearance.ts";
import { editorPageTurning } from "../../../src/cm/editorPageTurning.ts";
import controls from "../../../src/components/editorReadingControls.js";
window.readingScrollIntoView = (position) => EditorView.scrollIntoView(position, { y: "start" });
window.setupReading = () => {
	const header = document.createElement("header"),
		pencil = document.createElement("span");
	header.className = "tile";
	header.append(pencil);
	pencil.className = "icon editor-tools-hammer";
	const main = document.createElement("main");
	main.className = "editor-pane-root";
	main.style.height = "300px";
	const element = document.createElement("section");
	element.className = "editor-pane active";
	const tabs = document.createElement("ul");
	tabs.className = "editor-pane-tabs";
	tabs.textContent = "tab";
	const content = document.createElement("div");
	content.className = "editor-pane-content";
	const container = document.createElement("div");
	container.className = "editor-container";
	content.append(container);
	element.append(tabs, content);
	main.append(element);
	document.body.append(header, main);
	const ro = new Compartment();
	const paging = new Compartment();
	const layout = new Compartment();
	const view = new EditorView({
		doc: Array.from(
			{ length: 200 },
			(_, i) => "line " + i + " sample text",
		).join("\n"),
		parent: container,
		extensions: [
			drawSelection(),
			highlightActiveLine(),
			lineNumbers(),
			EditorView.theme({
				"&": { height: "100%" },
				".cm-scroller": { overflow: "auto", height: "100%" },
			}),
			ro.of(createEditorReadOnlyExtension(true)),
			paging.of([]),
			layout.of([]),
		],
	});
	const file = { id: "reading-browser-fixture", type: "editor", editable: false, loaded: true };
	const pane = { element, editor: view };
	const manager = { activeFile: file, getFilePane: () => pane, on: () => {} };
	const thumb = document.createElement("div");
	thumb.id = "bookmark-test-thumb";
	thumb.style.cssText = "position:fixed;right:5px;top:90px;width:10px;height:50px;background:#39f;pointer-events:none";
	document.body.append(thumb);
	view.scrollDOM.addEventListener("scroll", () => {
		const max = Math.max(1, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
		thumb.style.top = `${90 + 100 * view.scrollDOM.scrollTop / max}px`;
	});
	manager.getBookmarkScrollbarPoint = () => {
		const rect = thumb.getBoundingClientRect();
		return (rect.top + rect.bottom) / 2;
	};
	const control = controls({
		bookmarkStorage: (() => {
			const data = new Map();
			return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
		})(),
		manager,
		header,
		pencil,
		exec: () => {
			file.editable = !file.editable;
			reconfigureEditorReadOnly(view, ro, !file.editable);
		},
		labels: {
			readOnly: "read",
			edit: "edit",
			fullscreen: "full",
			exit: "exit",
		},
	});
	control.update();
	window.reading = {
		control,
		file,
		view,
		main,
		pane,
		setAppearance(values) {
			view.dispatch({ effects: layout.reconfigure([
				editorAppearance(values),
				EditorView.theme({ ".cm-cursor": { borderLeftWidth: `${values.cursorWidth || 2}px` } }),
			]) });
		},
		setLayout(doc, wrap, lineHeight, paragraphSpacing, editorPaddingTop) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: doc },
				effects: layout.reconfigure([
					wrap ? EditorView.lineWrapping : [],
					EditorView.theme({
						"&": { fontSize: "17px" },
						".cm-content": { lineHeight: String(lineHeight) },
					}),
					editorAppearance({ editorParagraphSpacing: paragraphSpacing, editorPaddingTop }),
				]),
			});
		},
		setPaging(enabled, distance, lockVertical = false) {
			view.dispatch({
				effects: paging.reconfigure(
					editorPageTurning({
						editorPageTurning: enabled,
						editorPageLockVerticalScroll: lockVertical,
						editorPageSwipeDistance: distance,
					}),
				),
			});
		},
	};
};

import { captureReadingPosition, persistReadingPosition, savedReadingPosition, forgetReadingPosition, restoreReadingPosition } from "../../../src/lib/readingSession.js";
window.testReadingRestart = async () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const files = [0, 1].map(i => ({ id: `restart-${i}`, uri: `file:///restart-${i}.txt`, type: "editor", loaded: true }));
  storage.setItem("files", JSON.stringify(files));
  const docs = files.map((_, i) => Array.from({ length: 250 }, (_, n) => `document ${i} line ${n} ` + "wrapped text sample ".repeat(5)).join("\n"));
  const wait = () => new Promise(resolve => setTimeout(resolve, 180));
  function create(doc, fullscreen) {
    const host = document.createElement("div");
    host.className = fullscreen ? "editor-pane editor-content-fullscreen" : "editor-pane";
    if (!fullscreen) host.style.cssText = "position:fixed;left:0;top:80px;width:412px;height:300px;z-index:20000";
    document.body.append(host);
    const view = new EditorView({ doc, parent: host, extensions: [
      createEditorReadOnlyExtension(true), EditorView.lineWrapping,
      editorAppearance({ editorPaddingTop: 30 }),
      EditorView.theme({ "&": { height: "100%", fontSize: "17px" }, ".cm-content": { lineHeight: "1.6" }, ".cm-scroller": { overflow: "auto" } }),
    ] });
    return { host, view };
  }
  const before = [];
  for (let i = 0; i < files.length; i++) {
    const { host, view } = create(docs[i], i === 1);
    await wait();
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(60 + i * 70).from, { y: "start" }) });
    await wait(); view.scrollDOM.scrollTop += 5; await wait();
    persistReadingPosition(files[i], view, storage);
    before.push(captureReadingPosition(view));
    // Destroy directly: deliberately invoke no pause, pagehide or save-state.
    view.destroy(); host.remove();
  }
  const after = [], readOnly = [], fullscreen = [];
  for (let i = 0; i < files.length; i++) {
    const file = { ...files[i], readingPosition: savedReadingPosition(files[i], storage) };
    const { host, view } = create(docs[i], false);
    await wait();
    await new Promise(resolve => restoreReadingPosition(view, file, () => true, resolve));
    await wait();
    after.push(captureReadingPosition(view)); readOnly.push(view.state.readOnly); fullscreen.push(host.classList.contains("editor-content-fullscreen"));
    view.destroy(); host.remove();
  }
  forgetReadingPosition(files[0], storage);
  const closedPosition = savedReadingPosition({ id: files[0].id, uri: files[0].uri }, storage);
  const reopened = create(docs[0], false); await wait();
  const reopenedTop = reopened.view.scrollDOM.scrollTop;
  reopened.view.destroy(); reopened.host.remove();
  return { before, after, readOnly, fullscreen, closedPosition, reopenedTop };
};

// Multiple documents share one EditorView, as in the application tab switcher.
window.testSharedReadingTabs = async (wrap) => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const host = document.createElement("div");
  host.className = "editor-pane";
  host.style.cssText = "position:fixed;left:0;top:70px;width:412px;height:420px;z-index:20000";
  document.body.append(host);
  const createState = doc => EditorState.create({ doc, extensions: [
    createEditorReadOnlyExtension(true), wrap ? EditorView.lineWrapping : [],
    editorAppearance({ editorPaddingTop: 30, editorParagraphSpacing: 18 }),
    EditorView.theme({ "&": { height: "100%", fontSize: "17px" }, ".cm-content": { lineHeight: "1.6" }, ".cm-scroller": { overflow: "auto" } }),
  ] });
  let files = [0,1,2].map(i => ({ id: `shared-${i}`, uri: `file:///shared-${i}.txt`, type: "editor", loaded: true,
    session: createState(Array.from({ length: 220 }, (_, n) => `file ${i} paragraph ${n} ` + "reading words ".repeat(7+i)).join("\n")) }));
  let active = files[0], stop;
  const view = new EditorView({ state: active.session, parent: host });
  view.scrollDOM.addEventListener("scroll", () => persistReadingPosition(active, view, storage));
  const snapshot = () => {
    persistReadingPosition(active, view, storage);
    storage.setItem("files", JSON.stringify(files.map(file => ({ id: file.id, uri: file.uri, type: "editor", loaded: true,
      readingPosition: file.readingPosition, scrollTop: file.lastScrollTop, scrollLeft: file.lastScrollLeft, render: file === active, editable: false }))));
  };
  async function switchTo(index) {
    persistReadingPosition(active, view, storage);
    active.session = view.state;
    stop?.(); active = files[index];
    active.__readingRestorePending = !!active.readingPosition;
    view.setState(active.session);
    if (active.readingPosition) await new Promise(resolve => { stop = restoreReadingPosition(view, active, () => active === files[index], resolve); });
    await wait(60);
    snapshot();
    return { ...captureReadingPosition(view), pixel: view.scrollDOM.scrollTop };
  }
  const expected = [], switches = [], restarted = [], restartSwitches = [];
  try {
    snapshot(); await wait(180);
    for (let i = 0; i < files.length; i++) {
      await switchTo(i);
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(45+i*55).from, { y: "start" }) });
      await wait(180); view.scrollDOM.scrollTop += 7; await wait(180);
      snapshot(); expected.push({ ...captureReadingPosition(view), pixel: view.scrollDOM.scrollTop });
    }
    for (let n = 0; n < 12; n++) for (const i of [0,1,2]) switches.push({ index: i, position: await switchTo(i) });
    await switchTo(0); snapshot();
    const docs = files.map(file => file.session.doc.toString());
    const saved = JSON.parse(storage.getItem("files"));
    stop?.(); view.destroy(); host.remove(); // hard close: no final save callback
    files = saved.map((file, i) => ({ ...file, session: createState(docs[i]), readingPosition: savedReadingPosition(file, storage) }));
    active = files[0];
    // Reuse the same host dimensions, but a brand new shared editor/window.
    document.body.append(host);
    const next = new EditorView({ state: active.session, parent: host });
    next.scrollDOM.addEventListener("scroll", () => persistReadingPosition(active, next, storage));
    let cancel;
    async function visit(index) {
      persistReadingPosition(active, next, storage); active.session = next.state;
      cancel?.(); active = files[index]; active.__readingRestorePending = !!active.readingPosition;
      next.setState(active.session);
      await new Promise(resolve => { cancel = restoreReadingPosition(next, active, () => active === files[index], resolve); });
      await wait(60);
      return { ...captureReadingPosition(next), pixel: next.scrollDOM.scrollTop };
    }
    // File 1 is initially visible; files 2/3 remain inactive until visited.
    await new Promise(resolve => { cancel = restoreReadingPosition(next, active, () => active === files[0], resolve); });
    for (let i = 0; i < files.length; i++) restarted.push(await visit(i));
    for (let n = 0; n < 8; n++) for (const i of [0,1,2]) restartSwitches.push({ index: i, position: await visit(i) });
    cancel?.(); next.destroy(); host.remove();
    return { expected, switches, restarted, restartSwitches };
  } finally {
    stop?.(); if (view.dom.isConnected) view.destroy(); host.remove();
  }
};
