import { EditorView, ViewPlugin } from "@codemirror/view";

export const editorPageTurningKeys = [
	"editorPageTurning",
	"editorPageSwipeDistance",
];

export function isValidPageSwipeDistance(value: unknown): boolean {
	if (typeof value !== "number" && typeof value !== "string") return false;
	if (typeof value === "string" && !value.trim()) return false;
	return Number.isFinite(Number(value)) && Number(value) >= 0;
}

interface Gesture {
	id: number;
	x: number;
	y: number;
	left: boolean;
}

/** Each page is the visible text viewport; never edits the document or cursor. */
export function editorPageTurning(values: {
	editorPageTurning?: boolean;
	editorPageSwipeDistance?: unknown;
}) {
	if (!values.editorPageTurning) return [];
	const distance = isValidPageSwipeDistance(values.editorPageSwipeDistance)
		? Number(values.editorPageSwipeDistance)
		: 60;
	return [
		EditorView.editorAttributes.of((view) =>
			view.state.readOnly ? { class: "cm-page-turning" } : null,
		),
		EditorView.theme({
			"&.cm-page-turning .cm-scroller": { touchAction: "pan-y" },
			"&.cm-page-turning .cm-content": {
				userSelect: "none",
				WebkitUserSelect: "none",
			},
		}),
		ViewPlugin.define((view) => {
			const root = view.scrollDOM;
			let gesture: Gesture | null = null;
			const down = (event: PointerEvent) => {
				if (!view.state.readOnly) return;
				if (event.isPrimary === false || event.button !== 0) return;
				const rect = root.getBoundingClientRect();
				gesture = {
					id: event.pointerId,
					x: event.clientX,
					y: event.clientY,
					left: event.clientX < rect.left + rect.width / 2,
				};
				event.stopImmediatePropagation();
			};
			const up = (event: PointerEvent) => {
				if (!view.state.readOnly || !gesture || event.pointerId !== gesture.id)
					return;
				const start = gesture;
				gesture = null;
				const dx = event.clientX - start.x;
				const dy = Math.abs(event.clientY - start.y);
				const turn =
					distance === 0
						? Math.abs(dx) <= 8 && dy <= 8
						: Math.abs(dx) >= distance &&
							Math.abs(dx) > dy &&
							(start.left ? dx > 0 : dx < 0);
				if (turn) {
					const max = Math.max(0, root.scrollHeight - root.clientHeight);
					root.scrollTop = Math.max(
						0,
						Math.min(
							max,
							root.scrollTop + (start.left ? -1 : 1) * root.clientHeight,
						),
					);
					event.preventDefault();
				}
				event.stopImmediatePropagation();
			};
			const cancel = () => {
				gesture = null;
			};
			const suppress = (event: Event) => {
				if (view.state.readOnly) event.stopImmediatePropagation();
			};
			const click = (event: Event) => {
				if (!view.state.readOnly) return;
				event.preventDefault();
				suppress(event);
			};
			root.addEventListener("pointerdown", down, true);
			root.addEventListener("pointerup", up, true);
			root.addEventListener("pointercancel", cancel, true);
			root.addEventListener("touchstart", suppress, {
				capture: true,
				passive: true,
			});
			root.addEventListener("mousedown", click, true);
			root.addEventListener("click", click, true);
			root.addEventListener("contextmenu", click, true);
			return {
				update(update) {
					if (update.startState.readOnly !== update.state.readOnly)
						gesture = null;
				},
				destroy() {
					root.removeEventListener("pointerdown", down, true);
					root.removeEventListener("pointerup", up, true);
					root.removeEventListener("pointercancel", cancel, true);
					root.removeEventListener("touchstart", suppress, true);
					root.removeEventListener("mousedown", click, true);
					root.removeEventListener("click", click, true);
					root.removeEventListener("contextmenu", click, true);
				},
			};
		}),
	];
}
