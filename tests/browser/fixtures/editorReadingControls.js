import { Compartment } from "@codemirror/state";
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
	const file = { type: "editor", editable: false, loaded: true };
	const pane = { element, editor: view };
	const manager = { activeFile: file, getFilePane: () => pane, on: () => {} };
	const control = controls({
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
		setLayout(doc, wrap, lineHeight, paragraphSpacing) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: doc },
				effects: layout.reconfigure([
					wrap ? EditorView.lineWrapping : [],
					EditorView.theme({
						"&": { fontSize: "17px" },
						".cm-content": { lineHeight: String(lineHeight) },
					}),
					editorAppearance({ editorParagraphSpacing: paragraphSpacing }),
				]),
			});
		},
		setPaging(enabled, distance) {
			view.dispatch({
				effects: paging.reconfigure(
					editorPageTurning({
						editorPageTurning: enabled,
						editorPageSwipeDistance: distance,
					}),
				),
			});
		},
	};
};
