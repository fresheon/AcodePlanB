/** Toolbar controls share the existing read-only command and preserve pane state. */
export default function editorReadingControls({
	manager,
	header,
	pencil,
	exec,
	labels,
}) {
	function button(id, icon, label) {
		const element = document.createElement("button");
		element.id = id;
		element.type = "button";
		element.className = `editor-reading-button icon ${icon}`;
		element.title = label;
		element.setAttribute("aria-label", label);
		return element;
	}
	const readOnlyButton = button(
		"editor-read-only-toggle",
		"visibility_off",
		labels.readOnly,
	);
	const fullscreenButton = button(
		"editor-content-fullscreen-toggle",
		"fullscreen",
		labels.fullscreen,
	);
	const exitButton = button(
		"editor-content-fullscreen-exit",
		"fullscreen_exit",
		labels.exit,
	);
	let fullscreenPane = null;
	let placeholder = null;
	let fullscreenFile = null;

	function exit() {
		if (!fullscreenPane) return;
		const pane = fullscreenPane;
		if (placeholder?.parentNode) placeholder.replaceWith(pane.element);
		pane.element.classList.remove("editor-content-fullscreen");
		document.body.classList.remove("editor-content-fullscreen-mode");
		exitButton.remove();
		fullscreenPane = placeholder = fullscreenFile = null;
		fullscreenButton.setAttribute("aria-pressed", "false");
		pane.editor?.requestMeasure();
		document.removeEventListener("keydown", onKeyDown, true);
	}
	function onKeyDown(event) {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		exit();
	}
	function enter() {
		const file = manager.activeFile;
		if (file?.type !== "editor" || file.loading) return;
		const pane = manager.getFilePane(file);
		if (!pane?.element?.parentNode) return;
		fullscreenFile = file;
		fullscreenPane = pane;
		placeholder = document.createComment("fullscreen editor pane");
		pane.element.replaceWith(placeholder);
		pane.editor?.contentDOM.blur();
		pane.element.classList.add("editor-content-fullscreen");
		document.body.classList.add("editor-content-fullscreen-mode");
		document.body.append(pane.element, exitButton);
		fullscreenButton.setAttribute("aria-pressed", "true");
		pane.editor?.requestMeasure();
		document.addEventListener("keydown", onKeyDown, true);
	}
	function update() {
		const file = manager.activeFile;
		if (fullscreenPane && file !== fullscreenFile) exit();
		if (file?.type !== "editor" || !pencil.isConnected) {
			readOnlyButton.remove();
			fullscreenButton.remove();
			return;
		}
		const readOnly = !file.editable;
		readOnlyButton.classList.toggle("remove_red_eyevisibility", readOnly);
		readOnlyButton.classList.toggle("visibility_off", !readOnly);
		readOnlyButton.setAttribute("aria-pressed", String(readOnly));
		const label = readOnly ? labels.edit : labels.readOnly;
		readOnlyButton.title = label;
		readOnlyButton.setAttribute("aria-label", label);
		readOnlyButton.disabled = !!file.loading || !file.loaded;
		header.insertBefore(readOnlyButton, pencil.nextSibling);
		header.insertBefore(fullscreenButton, readOnlyButton.nextSibling);
	}
	readOnlyButton.onclick = () => {
		if (manager.activeFile?.type !== "editor" || readOnlyButton.disabled)
			return;
		exec("read-only");
		update();
	};
	fullscreenButton.onclick = () => (fullscreenPane ? exit() : enter());
	exitButton.onclick = (event) => {
		event.preventDefault();
		event.stopPropagation();
		exit();
	};
	fullscreenButton.setAttribute("aria-pressed", "false");
	manager.on(["switch-file", "update:read-only", "file-loaded"], update);
	manager.on("remove-file", (file) => {
		if (file === fullscreenFile) exit();
	});
	return { update, enter, exit, readOnlyButton, fullscreenButton, exitButton };
}
