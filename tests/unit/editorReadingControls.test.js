// @vitest-environment happy-dom
import editorReadingControls, { readingProgressPercent } from "components/editorReadingControls";
import { afterEach, describe, expect, it, vi } from "vitest";

const controls = [];
afterEach(() => {
	for (const control of controls.splice(0)) control.exit();
	document.body.replaceChildren();
	vi.useRealTimers();
});
function setup() {
	const header = document.createElement("header");
	const pencil = document.createElement("span");
	header.append(pencil);
	const container = document.createElement("main");
	const element = document.createElement("section");
	container.append(element);
	document.body.append(header, container);
	const file = { type: "editor", editable: true, loaded: true };
	const pane = {
		element,
		editor: {
			contentDOM: document.createElement("div"),
			requestMeasure: vi.fn(),
		},
	};
	const handlers = new Map();
	const manager = {
		activeFile: file,
		getFilePane: () => pane,
		on: (events, handler) => {
			for (const name of [].concat(events)) handlers.set(name, handler);
		},
	};
	const exec = vi.fn(() => {
		file.editable = !file.editable;
	});
	const native = vi.fn((action, args, success) =>
		success(
			action === "editor-status"
				? { battery: 75, height: 24, iconSize: 16 }
				: undefined,
		),
	);
	const control = editorReadingControls({
		manager,
		header,
		pencil,
		exec,
		native,
		labels: {
			readOnly: "read",
			edit: "edit",
			fullscreen: "full",
			exit: "exit",
		},
	});
	control.update();
	controls.push(control);
	return {
		control,
		file,
		manager,
		header,
		pencil,
		container,
		pane,
		exec,
		handlers,
		native,
	};
}
describe("editor reading controls", () => {
 it("anchors progress at the first line, including empty and one-line documents", () => {
  expect(readingProgressPercent(1, 101)).toBe(0);
  expect(readingProgressPercent(51, 101)).toBe(50);
  expect(readingProgressPercent(101, 101)).toBe(100);
  expect(readingProgressPercent(1, 1)).toBe(0);
  expect(readingProgressPercent(1, 0)).toBe(0);
 });
 it("shows inert bookmark icons between the hammer and eye", () => {
  const { control, exec } = setup();
  control.bookmarkList.click();
  control.bookmarkAdd.click();
  expect(exec).not.toHaveBeenCalled();
  expect(control.bookmarkList.getAttribute("aria-disabled")).toBe("true");
  expect(control.bookmarkList.querySelector("svg")).not.toBeNull();
  expect(control.bookmarkAdd.querySelector("svg")).not.toBeNull();
 });
 it("updates progress after scrolling and stops listening on exit", () => {
  const { control, pane } = setup();
  const scroller = document.createElement("div");
  pane.editor.scrollDOM = scroller;
  pane.editor.scrollSnapshot = () => ({});
  pane.editor.dispatch = vi.fn();
  pane.editor.documentTop = 0;
  pane.editor.lineBlockAt = () => ({ top: 0, from: 0 });
  pane.editor.lineBlockAtHeight = () => ({ top: 0, from: 0 });
  let firstLine = 1;
  pane.editor.state = { doc: { lines: 101, lineAt: () => ({ number: firstLine }) } };
  pane.editor.requestMeasure = (request) => {
   if (request?.key) request.write(request.read());
  };
  control.enter();
  const percentage = document.querySelector(".editor-fullscreen-progress-percentage");
  expect(percentage.textContent).toBe("0%");
  firstLine = 51;
  scroller.dispatchEvent(new Event("scroll"));
  expect(percentage.textContent).toBe("50%");
  control.exit();
  firstLine = 101;
  scroller.dispatchEvent(new Event("scroll"));
  expect(percentage.textContent).toBe("50%");
 });
	it("hides native bars, shows status, and retains the invisible exit target after four seconds", () => {
		vi.useFakeTimers();
		const { control, native } = setup();
		control.enter();
		expect(native).toHaveBeenCalledWith(
			"editor-immersive",
			[true],
			expect.any(Function),
		);
		expect(
			document.getElementById("editor-fullscreen-status").textContent,
		).toContain("75%");
		vi.advanceTimersByTime(3999);
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(false);
		vi.advanceTimersByTime(1);
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(true);
		control.exitButton.click();
		expect(native).toHaveBeenCalledWith(
			"editor-immersive",
			[false],
			expect.any(Function),
		);
		expect(document.getElementById("editor-fullscreen-status")).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
		control.enter();
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(false);
	});
	it("reveals the hint for four seconds after four quick taps and ignores slow taps or swipes", () => {
		vi.useFakeTimers();
		const { control } = setup();
		control.enter();
		vi.advanceTimersByTime(4000);
		let time = 1000;
		function tap(gap = 150, movement = 0) {
			time += gap;
			for (const [type, stamp, x] of [["pointerdown", time, 100], ["pointerup", time + 20, 100 + movement]]) {
				const event = new Event(type, { bubbles: true });
				Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 200 });
				Object.defineProperty(event, "timeStamp", { value: stamp });
				document.body.dispatchEvent(event);
			}
		}
		for (let i = 0; i < 4; i++) tap(600);
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(true);
		tap(150, 50);
		for (let i = 0; i < 3; i++) tap();
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(true);
		tap();
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(false);
		vi.advanceTimersByTime(3999);
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(false);
		vi.advanceTimersByTime(1);
		expect(control.exitButton.classList.contains("hint-hidden")).toBe(true);
		control.exit();
		for (let i = 0; i < 4; i++) tap();
		expect(control.exitButton.isConnected).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("places buttons beside the pencil and uses the existing read-only command", () => {
		const { control, header, pencil, exec, file, handlers } = setup();
		expect([...header.children]).toEqual([
			pencil,
			control.bookmarkList,
			control.bookmarkAdd,
			control.readOnlyButton,
			control.fullscreenButton,
		]);
		expect(control.readOnlyButton.classList.contains("editor-mode-pencil")).toBe(
			true,
		);
		control.readOnlyButton.click();
		expect(exec).toHaveBeenCalledWith("read-only");
		expect(
			control.readOnlyButton.classList.contains("remove_red_eyevisibility"),
		).toBe(true);
		file.editable = true;
		handlers.get("update:read-only")();
		expect(control.readOnlyButton.classList.contains("editor-mode-pencil")).toBe(
			true,
		);
	});
	it("restores the pane but stays read-only until the eye is clicked outside fullscreen", () => {
		const { control, container, pane, file } = setup();
		const sibling = document.createElement("span");
		container.append(sibling);
		control.fullscreenButton.click();
		expect(pane.element.parentNode).toBe(document.body);
		expect(pane.element.classList.contains("editor-content-fullscreen")).toBe(
			true,
		);
		expect(file.editable).toBe(false);
		expect(control.readOnlyButton.disabled).toBe(true);
		control.readOnlyButton.click();
		expect(file.editable).toBe(false);
		control.exitButton.click();
		expect([...container.children]).toEqual([pane.element, sibling]);
		expect(file.editable).toBe(false);
		expect(control.readOnlyButton.disabled).toBe(false);
		control.readOnlyButton.click();
		expect(file.editable).toBe(true);
		expect(control.exitButton.isConnected).toBe(false);
	});
	it("rejects attempts to enable editing during fullscreen updates", () => {
		const { control, file, handlers } = setup();
		control.enter();
		file.editable = true;
		handlers.get("update:read-only")();
		expect(file.editable).toBe(false);
		expect(control.readOnlyButton.disabled).toBe(true);
	});
	it("exits on Escape and on file changes, including non-editor tabs", () => {
		const { control, manager, pane, container, handlers } = setup();
		control.enter();
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(pane.element.parentNode).toBe(container);
		control.enter();
		manager.activeFile = { type: "terminal" };
		handlers.get("switch-file")();
		expect(pane.element.parentNode).toBe(container);
		expect(control.readOnlyButton.isConnected).toBe(false);
		expect(control.fullscreenButton.isConnected).toBe(false);
	});
});
