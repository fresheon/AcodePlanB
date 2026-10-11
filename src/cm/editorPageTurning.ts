import { EditorView, ViewPlugin } from "@codemirror/view";

export const editorPageTurningKeys = [
	"editorPageTurning",
	"editorPageSwipeDistance",
	"editorPageLockVerticalScroll",
];

export function isValidPageSwipeDistance(value: unknown): boolean {
	if (typeof value !== "number" && typeof value !== "string") return false;
	if (typeof value === "string" && !value.trim()) return false;
	return Number.isFinite(Number(value)) && Number(value) >= 0;
}

interface PageRow {
	top: number;
	bottom: number;
}

/** The first incomplete row belongs entirely to the following page. */
export function pageBoundary(rows: PageRow[], top: number, bottom: number) {
	return (
		rows.find(
			(row) =>
				row.bottom - row.top <= bottom - top + 0.5 &&
				row.top > top + 0.5 &&
				row.top < bottom - 0.5 &&
				row.bottom > bottom + 0.5,
		)?.top ?? bottom
	);
}

// Range rectangles expose visual rows, including wrapping and paragraph gaps.
function visibleRows(view: EditorView): PageRow[] {
	const rows: PageRow[] = [];
	for (const line of view.contentDOM.querySelectorAll<HTMLElement>(
		".cm-line",
	)) {
		const box = line.getBoundingClientRect();
		if (box.height <= 0) continue;
		const style = getComputedStyle(line);
		const height =
			Number.parseFloat(style.lineHeight) || view.defaultLineHeight;
		const top = box.top + (Number.parseFloat(style.paddingTop) || 0);
		const range = document.createRange();
		range.selectNodeContents(line);
		const rectangles = Array.from(range.getClientRects())
			.filter((rect) => rect.height > 0)
			.sort((a, b) => a.top - b.top);
		const glyphRows: PageRow[] = [];
		for (const rect of rectangles) {
			const previous = glyphRows[glyphRows.length - 1];
			if (previous && rect.top < previous.bottom - 0.5)
				previous.bottom = Math.max(previous.bottom, rect.bottom);
			else glyphRows.push({ top: rect.top, bottom: rect.bottom });
		}
		if (!glyphRows.length) rows.push({ top, bottom: top + height });
		else
			for (const row of glyphRows) {
				const rowTop = top + row.top - glyphRows[0].top;
				rows.push({
					top: rowTop,
					bottom: rowTop + Math.max(height, row.bottom - row.top),
				});
			}
	}
	return rows.sort((a, b) => a.top - b.top);
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
	editorPageLockVerticalScroll?: boolean;
}) {
	if (!values.editorPageTurning) return [];
	const distance = isValidPageSwipeDistance(values.editorPageSwipeDistance)
		? Number(values.editorPageSwipeDistance)
		: 60;
	return [
		EditorView.editorAttributes.of((view) =>
			view.state.readOnly ? { class: `cm-page-turning${values.editorPageLockVerticalScroll ? " cm-page-lock-vertical" : ""}` } : null,
		),
		EditorView.theme({
			"&.cm-page-turning .cm-scroller": { touchAction: "pan-y" },
			".editor-content-fullscreen &.cm-page-lock-vertical .cm-scroller": { touchAction: "none", overflowY: "hidden" },
			"&.cm-page-turning .cm-content": {
				paddingBottom: "calc(var(--editor-content-bottom, 0px) + var(--cm-page-tail, 0px))",
				userSelect: "none",
				WebkitUserSelect: "none",
			},
		}),
		ViewPlugin.define((view) => {
			const root = view.scrollDOM;
			let gesture: Gesture | null = null;
			const previousClip = root.style.clipPath;
			const previousTail = root.style.getPropertyValue("--cm-page-tail");
			const history: { from: number; to: number }[] = [];
			let destroyed = false;
			let pending = 0;
			let alignTop = false;
			const measureKey = {};
			const restore = () => {
				root.style.clipPath = previousClip;
				if (previousTail)
					root.style.setProperty("--cm-page-tail", previousTail);
				else root.style.removeProperty("--cm-page-tail");
			};
			const schedule = () => {
				if (destroyed || !view.state.readOnly) return;
				view.requestMeasure({
					key: measureKey,
					read() {
						const box = root.getBoundingClientRect();
						const rows = visibleRows(view);
						const bottom = box.top + root.clientHeight;
						return {
							top: box.top,
							bottom,
							rows,
							cut: pageBoundary(rows, box.top, bottom),
							end: rows.length
								? view.documentTop +
									view.lineBlockAt(view.state.doc.length).bottom
								: null,
						};
					},
					write(data) {
						if (destroyed || !view.state.readOnly) return;
						const tail = `${root.clientHeight}px`;
						if (root.style.getPropertyValue("--cm-page-tail") !== tail) {
							history.length = 0;
							root.style.setProperty("--cm-page-tail", tail);
						}
						if (alignTop) {
							alignTop = false;
							const row = data.rows.find(
								(row) =>
									row.top < data.top - 0.5 && row.bottom > data.top + 0.5,
							);
							if (row) {
								root.scrollTop += row.top - data.top;
								schedule();
								return;
							}
						}
						if (pending) {
							const direction = pending;
							pending = 0;
							const from = root.scrollTop;
							let target = from;
							if (direction > 0) {
								if (data.end == null || data.end > data.bottom + 0.5)
									target += data.cut - data.top;
							} else {
								const last = history.pop();
								if (last && Math.abs(last.to - from) <= 1) target = last.from;
								else {
									history.length = 0;
									target -= root.clientHeight;
									alignTop = true;
								}
							}
							root.scrollTop = Math.max(
								0,
								Math.min(root.scrollHeight - root.clientHeight, target),
							);
							if (direction > 0 && root.scrollTop > from)
								history.push({ from, to: root.scrollTop });
							schedule();
							return;
						}
						const clip = Math.max(0, data.bottom - data.cut);
						root.style.clipPath =
							clip > 0.5 ? `inset(0px 0px ${clip}px 0px)` : previousClip;
					},
				});
			};
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
					pending = start.left ? -1 : 1;
					schedule();
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
			const blockVerticalScroll = (event: Event) => {
				if (values.editorPageLockVerticalScroll && view.state.readOnly && view.dom.closest(".editor-content-fullscreen")) event.preventDefault();
			};
			root.addEventListener("touchmove", blockVerticalScroll, { passive: false });
			root.addEventListener("wheel", blockVerticalScroll, { passive: false });
			root.addEventListener("scroll", schedule, { passive: true });
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
			schedule();
			return {
				update(update) {
					if (update.docChanged) history.length = 0;
					if (update.startState.readOnly !== update.state.readOnly) {
						gesture = null;
						pending = 0;
						alignTop = false;
						history.length = 0;
						if (!update.state.readOnly) restore();
					}
					if (
						update.geometryChanged ||
						update.viewportChanged ||
						update.startState.readOnly !== update.state.readOnly
					)
						schedule();
				},
				destroy() {
					destroyed = true;
					restore();
					root.removeEventListener("scroll", schedule);
					root.removeEventListener("touchmove", blockVerticalScroll);
					root.removeEventListener("wheel", blockVerticalScroll);
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
