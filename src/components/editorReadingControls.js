/** Toolbar controls share the existing read-only command and preserve pane state. */
export default function editorReadingControls({
	manager,
	header,
	pencil,
	exec,
	labels,
	native = (action, args, success) => {
		window.cordova?.exec(success, console.error, "System", action, args);
	},
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
		"editor-mode-pencil",
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
	const status = document.createElement("div");
	status.id = "editor-fullscreen-status";
	const clock = document.createElement("time");
	const battery = document.createElement("span");
	battery.className = "editor-fullscreen-battery";
	const level = document.createElement("span");
	level.className = "editor-fullscreen-battery-level";
	battery.append(level);
	const percentage = document.createElement("span");
	status.append(clock, battery, percentage);
	let hintTimer;
	let statusTimer;
	function refreshStatus() {
		clock.textContent = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
		const pane = fullscreenPane;
		if (!pane) return;
		status.style.color = getComputedStyle(
			pane.editor?.contentDOM || pane.element,
		).color;
		native("editor-status", [], (data) => {
			if (fullscreenPane !== pane) return;
			if (Number.isFinite(data.battery)) {
				level.style.width = `${data.battery}%`;
				percentage.textContent = `${data.charging ? "ϟ " : ""}${data.battery}%`;
				battery.setAttribute("aria-label", percentage.textContent);
			}
		});
	}
	let fullscreenPane = null;
	let placeholder = null;
	let fullscreenFile = null;

	function captureScroll(pane) {
		const view = pane.editor;
		if (!view?.scrollDOM) return () => {};
		const { scrollTop, scrollLeft } = view.scrollDOM;
		const snapshot = view.scrollSnapshot();
		return () => {
			// Reparenting disconnects the scroller and resets browser scroll offsets.
			// Restore offsets immediately and let CodeMirror retain the text anchor
			// while measuring the new viewport (including wrapped paragraphs).
			view.scrollDOM.scrollTop = scrollTop;
			view.scrollDOM.scrollLeft = scrollLeft;
			view.dispatch({ effects: snapshot });
		};
	}

	function exit() {
		if (!fullscreenPane) return;
		const pane = fullscreenPane;
		const restoreScroll = captureScroll(pane);
		if (placeholder?.parentNode) placeholder.replaceWith(pane.element);
		pane.element.classList.remove("editor-content-fullscreen");
		document.body.classList.remove("editor-content-fullscreen-mode");
		clearTimeout(hintTimer);
		clearInterval(statusTimer);
		status.remove();
		native("editor-immersive", [false], () => pane.editor?.requestMeasure());
		exitButton.remove();
		restoreScroll();
		fullscreenPane = placeholder = fullscreenFile = null;
		fullscreenButton.setAttribute("aria-pressed", "false");
		pane.editor?.requestMeasure();
		document.removeEventListener("keydown", onKeyDown, true);
		update();
	}
	function onKeyDown(event) {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		exit();
	}
	function enter() {
		if (fullscreenPane) return;
		const file = manager.activeFile;
		if (file?.type !== "editor" || file.loading) return;
		const pane = manager.getFilePane(file);
		if (!pane?.element?.parentNode) return;
		const restoreScroll = captureScroll(pane);
		if (file.editable) exec("read-only");
		fullscreenFile = file;
		fullscreenPane = pane;
		placeholder = document.createComment("fullscreen editor pane");
		pane.element.replaceWith(placeholder);
		pane.editor?.contentDOM.blur();
		pane.element.classList.add("editor-content-fullscreen");
		document.body.classList.add("editor-content-fullscreen-mode");
		exitButton.classList.remove("hint-hidden");
		document.body.append(pane.element, status, exitButton);
		restoreScroll();
		native("editor-immersive", [true], () => pane.editor?.requestMeasure());
		refreshStatus();
		statusTimer = setInterval(refreshStatus, 15000);
		hintTimer = setTimeout(() => exitButton.classList.add("hint-hidden"), 4000);
		fullscreenButton.setAttribute("aria-pressed", "true");
		pane.editor?.requestMeasure();
		document.addEventListener("keydown", onKeyDown, true);
		update();
	}
	function update() {
		const file = manager.activeFile;
		if (fullscreenPane && file !== fullscreenFile) exit();
		if (fullscreenPane && file?.editable) file.editable = false;
		if (file?.type !== "editor" || !pencil.isConnected) {
			readOnlyButton.remove();
			fullscreenButton.remove();
			return;
		}
		const readOnly = !file.editable;
		readOnlyButton.classList.toggle("remove_red_eyevisibility", readOnly);
		readOnlyButton.classList.toggle("editor-mode-pencil", !readOnly);
		readOnlyButton.setAttribute("aria-pressed", String(readOnly));
		const label = readOnly ? labels.edit : labels.readOnly;
		readOnlyButton.title = label;
		readOnlyButton.setAttribute("aria-label", label);
		readOnlyButton.disabled =
			!!fullscreenPane || !!file.loading || !file.loaded;
		header.insertBefore(readOnlyButton, pencil.nextSibling);
		header.insertBefore(fullscreenButton, readOnlyButton.nextSibling);
	}
	readOnlyButton.onclick = () => {
		if (
			fullscreenPane ||
			manager.activeFile?.type !== "editor" ||
			readOnlyButton.disabled
		)
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
