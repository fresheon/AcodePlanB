// @vitest-environment happy-dom
import editorReadingControls from "components/editorReadingControls";
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
	it("places buttons beside the pencil and uses the existing read-only command", () => {
		const { control, header, pencil, exec, file, handlers } = setup();
		expect([...header.children]).toEqual([
			pencil,
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
