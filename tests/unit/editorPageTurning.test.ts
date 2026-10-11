// @vitest-environment happy-dom
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
	editorPageTurning,
	isValidPageSwipeDistance,
} from "cm/editorPageTurning";
import { afterEach, describe, expect, it, vi } from "vitest";

const views: EditorView[] = [];
afterEach(() => {
	for (const view of views.splice(0)) view.destroy();
	document.body.replaceChildren();
});
function setup(distance = 60) {
	const compartment = new Compartment();
	const readOnly = new Compartment();
	const view = new EditorView({
		doc: "unchanged text",
		parent: document.body,
		extensions: [
			readOnly.of(EditorState.readOnly.of(true)),
			compartment.of(
				editorPageTurning({
					editorPageTurning: true,
					editorPageSwipeDistance: distance,
				}),
			),
		],
	});
	views.push(view);
	const root = view.scrollDOM;
	Object.defineProperties(root, {
		clientHeight: { value: 400 },
		scrollHeight: { value: 1400 },
	});
	vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
		left: 0,
		width: 800,
	} as DOMRect);
	function gesture(x: number, dx = 0, dy = 0, cancel = false) {
		root.dispatchEvent(
			new PointerEvent("pointerdown", {
				pointerId: 1,
				isPrimary: true,
				clientX: x,
				clientY: 100,
				button: 0,
				bubbles: true,
			}),
		);
		root.dispatchEvent(
			new PointerEvent(cancel ? "pointercancel" : "pointerup", {
				pointerId: 1,
				isPrimary: true,
				clientX: x + dx,
				clientY: 100 + dy,
				bubbles: true,
				cancelable: true,
			}),
		);
	}
	return { view, root, gesture, compartment, readOnly };
}
describe("editor page turning", () => {
	it("suspends taps, swipes and input blockers during editing without disabling the preference", () => {
		const { view, root, gesture, readOnly } = setup(0);
		gesture(600);
		expect(root.scrollTop).toBe(400);
		view.dispatch({
			effects: readOnly.reconfigure(EditorState.readOnly.of(false)),
		});
		expect(view.dom.classList.contains("cm-page-turning")).toBe(false);
		gesture(600);
		gesture(600, -100);
		expect(root.scrollTop).toBe(400);
		const down = new MouseEvent("mousedown", {
			bubbles: true,
			cancelable: true,
		});
		root.dispatchEvent(down);
		expect(down.defaultPrevented).toBe(false);
		view.dispatch({
			effects: readOnly.reconfigure(EditorState.readOnly.of(true)),
		});
		expect(view.dom.classList.contains("cm-page-turning")).toBe(true);
		gesture(600);
		expect(root.scrollTop).toBe(800);
	});
	it("accepts nonnegative px distances including zero and rejects empty, negative or nonfinite input", () => {
		for (const value of [0, "0", 60, "12.5", 2000])
			expect(isValidPageSwipeDistance(value)).toBe(true);
		for (const value of ["", " ", -1, Infinity, "bad", null, false])
			expect(isValidPageSwipeDistance(value)).toBe(false);
	});
	it("turns one viewport only for a qualifying swipe in the specified half and direction", () => {
		const { root, gesture, view } = setup();
		const selection = view.state.selection;
		gesture(600, -60);
		expect(root.scrollTop).toBe(400);
		gesture(100, 60);
		expect(root.scrollTop).toBe(0);
		for (const [x, dx, dy] of [
			[600, -59, 0],
			[600, 60, 0],
			[100, -60, 0],
			[600, -80, 100],
			[600, 0, 0],
		]) {
			gesture(x, dx, dy);
			expect(root.scrollTop).toBe(0);
		}
		gesture(600, -100, 0, true);
		expect(root.scrollTop).toBe(0);
		expect(view.state.doc.toString()).toBe("unchanged text");
		expect(view.state.selection).toBe(selection);
	});
	it("uses taps when distance is zero and clamps at the document boundaries", () => {
		const { root, gesture } = setup(0);
		gesture(100);
		expect(root.scrollTop).toBe(0);
		gesture(600);
		expect(root.scrollTop).toBe(400);
		gesture(600);
		gesture(600);
		expect(root.scrollTop).toBe(1000);
		gesture(600);
		expect(root.scrollTop).toBe(1000);
		gesture(100);
		expect(root.scrollTop).toBe(600);
		gesture(600, -80);
		expect(root.scrollTop).toBe(600);
	});
	it("applies distance changes and removes gesture handlers when disabled", () => {
		const { view, root, compartment, gesture } = setup();
		const mouseDown = new MouseEvent("mousedown", {
			bubbles: true,
			cancelable: true,
		});
		root.dispatchEvent(mouseDown);
		expect(mouseDown.defaultPrevented).toBe(true);
		view.dispatch({
			effects: compartment.reconfigure(
				editorPageTurning({
					editorPageTurning: true,
					editorPageSwipeDistance: 0,
				}),
			),
		});
		gesture(600);
		expect(root.scrollTop).toBe(400);
		view.dispatch({
			effects: compartment.reconfigure(
				editorPageTurning({ editorPageTurning: false }),
			),
		});
		gesture(600);
		expect(root.scrollTop).toBe(400);
		expect(view.dom.classList.contains("cm-page-turning")).toBe(false);
		const click = new MouseEvent("click", { bubbles: true, cancelable: true });
		root.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(false);
		const normalMouseDown = new MouseEvent("mousedown", {
			bubbles: true,
			cancelable: true,
		});
		root.dispatchEvent(normalMouseDown);
		expect(normalMouseDown.defaultPrevented).toBe(false);
	});
});
