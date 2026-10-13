import documentBookmarks from "./documentBookmarks";

export function readingProgressPercent(firstLine, totalLines) {
	if (totalLines <= 1) return 0;
	return Math.max(0, Math.min(100, Math.round(((firstLine - 1) / (totalLines - 1)) * 100)));
}

/** Toolbar controls share the existing read-only command and preserve pane state. */
export default function editorReadingControls({
	manager,
	header,
	pencil,
	exec,
	labels,
	bookmarkStorage,
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
	percentage.className = "editor-fullscreen-battery-percentage";
	function svgIcon(element, paths) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		for (const [d, filled] of paths) {
			const path = document.createElementNS(svg.namespaceURI, "path");
			path.setAttribute("d", d);
			path.setAttribute("fill", filled ? "currentColor" : "none");
			path.setAttribute("stroke", "currentColor");
			path.setAttribute("stroke-width", "1.5");
			path.setAttribute("stroke-linecap", "round");
			path.setAttribute("stroke-linejoin", "round");
			svg.append(path);
		}
		element.append(svg);
	}
	const progress = document.createElement("span");
	progress.className = "editor-fullscreen-progress";
	progress.setAttribute("aria-label", labels.progress || "Reading progress");
	svgIcon(progress, [
		["M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1Z", true],
		["M12 5c3-2 7-2 10-1v15c-3-1-7-1-10 1Z", false],
	]);
	// Crop the SVG's empty margins so the visible book fills the battery height.
	progress.querySelector("svg").setAttribute("viewBox", "1.25 2.5 21.5 18.25");
	const progressPercentage = document.createElement("span");
	progressPercentage.className = "editor-fullscreen-progress-percentage";
	progressPercentage.textContent = "0%";
	progress.append(progressPercentage);
	status.append(clock, battery, percentage, progress);
	const bookmarkList = button("editor-bookmark-list", "editor-bookmark", labels.bookmarks || "Bookmarks");
	const bookmarkAdd = button("editor-bookmark-add", "editor-bookmark", labels.addBookmark || "Add bookmark");
	const bookmarkOutline = "M6 3h12v18l-6-4-6 4Z";
	svgIcon(bookmarkList, [[bookmarkOutline, false], ["M9 7h6M9 10h6M9 13h4", false]]);
	svgIcon(bookmarkAdd, [[bookmarkOutline, false], ["M9 10h6M12 7v6", false]]);
	const bookmarks = documentBookmarks({ manager, labels, storage: bookmarkStorage });
	bookmarkList.onclick = () => bookmarks.open();
	bookmarkAdd.onclick = () => bookmarks.add();
	let hintTimer;
	let statusTimer;
	const progressMeasureKey = {};
	function refreshProgress() {
		const pane = fullscreenPane;
		const view = pane?.editor;
		if (!view?.scrollDOM || !view.state?.doc) return;
		view.requestMeasure({
			key: progressMeasureKey,
			read() {
				const top = view.scrollDOM.getBoundingClientRect().top;
				const first = view.lineBlockAtHeight(Math.max(0, top - view.documentTop));
				return readingProgressPercent(view.state.doc.lineAt(first.from).number, view.state.doc.lines);
			},
			write(value) {
				if (fullscreenPane === pane) progressPercentage.textContent = `${value}%`;
			},
		});
	}
	function refreshStatus() {
		clock.textContent = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
		const pane = fullscreenPane;
		if (!pane) {
			status.style.color = "#f5f5f5";
			status.style.setProperty("--editor-status-background", getComputedStyle(document.body).getPropertyValue("--primary-color"));
		} else {
		refreshProgress();
		status.style.color = getComputedStyle(
			pane.editor?.contentDOM || pane.element,
		).color;
		status.style.setProperty("--editor-status-background", getComputedStyle(
			pane.editor?.dom || pane.element,
		).backgroundColor);
		}
		native("editor-status", [], (data) => {
			if (fullscreenPane !== pane) return;
			if (Number.isFinite(data.battery)) {
				level.style.width = `${data.battery}%`;
				percentage.textContent = `${data.charging ? "ϟ " : ""}${data.battery}%`;
				battery.setAttribute("aria-label", percentage.textContent);
			}
		});
	}
	function syncNormalStatus() {
        const dark = document.body.getAttribute("theme-type") === "dark";
        const normal = dark && !fullscreenPane;
        document.body.classList.toggle("app-dark-status-mode", normal);
        progress.hidden = !fullscreenPane;
        if (normal) {
            document.body.append(status);
            refreshStatus();
            if (!statusTimer) statusTimer = setInterval(refreshStatus, 15000);
        } else if (!fullscreenPane) {
            status.remove(); clearInterval(statusTimer); statusTimer = null;
        }
    }
    const themeObserver = new MutationObserver(syncNormalStatus);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ["theme-type"] });
    let fullscreenPane = null;
	let placeholder = null;
	let fullscreenFile = null;

	let scrollTransition = 0;
	function captureScroll(pane) {
		const transition = ++scrollTransition;
		const view = pane.editor;
		if (!view?.scrollDOM) return () => {};
		const { scrollTop, scrollLeft } = view.scrollDOM;
		const snapshot = view.scrollSnapshot();
		const top = view.scrollDOM.getBoundingClientRect().top;
		const anchor = view.lineBlockAtHeight(top - view.documentTop);
		const offset = anchor.top + view.documentTop - top;
		return () => {
			// Reparenting disconnects the scroller and resets browser scroll offsets.
			// Restore offsets immediately and let CodeMirror retain the text anchor
			// while measuring the new viewport (including wrapped paragraphs).
			view.scrollDOM.scrollTop = scrollTop;
			view.scrollDOM.scrollLeft = scrollLeft;
			view.dispatch({ effects: snapshot });
			requestAnimationFrame(() => {
				if (transition !== scrollTransition || !view.dom.isConnected) return;
				view.requestMeasure({
					read: () =>
						view.lineBlockAt(anchor.from).top +
						view.documentTop -
						view.scrollDOM.getBoundingClientRect().top,
					write: (current) => {
						if (transition === scrollTransition)
							view.scrollDOM.scrollTop += current - offset;
					},
				});
			});
		};
	}

	let tapStart = null;
	let tapCount = 0;
	let lastTap = 0;
	function showExitHint() {
		clearTimeout(hintTimer);
		exitButton.classList.remove("hint-hidden");
		hintTimer = setTimeout(() => exitButton.classList.add("hint-hidden"), 4000);
	}
	function onPointerDown(event) {
		if (!event.isPrimary || event.button !== 0) return;
		tapStart = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			time: event.timeStamp,
		};
	}
	function onPointerUp(event) {
		const start = tapStart;
		tapStart = null;
		if (
			!start ||
			start.id !== event.pointerId ||
			event.timeStamp - start.time > 500 ||
			Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
		) {
			tapCount = 0;
			return;
		}
		tapCount = event.timeStamp - lastTap <= 500 ? tapCount + 1 : 1;
		lastTap = event.timeStamp;
		if (tapCount === 4) {
			tapCount = 0;
			showExitHint();
		}
	}
	function onPointerCancel() {
		tapStart = null;
		tapCount = 0;
	}

	function exit() {
		if (!fullscreenPane) return;
		const pane = fullscreenPane;
		if (pane.editor) delete pane.editor.__bookmarkNormalViewportTop;
		const restoreScroll = captureScroll(pane);
		if (placeholder?.parentNode) placeholder.replaceWith(pane.element);
		pane.element.classList.remove("editor-content-fullscreen");
		document.body.classList.remove("editor-content-fullscreen-mode");
		clearTimeout(hintTimer);
		clearInterval(statusTimer); statusTimer = null;
		pane.editor?.scrollDOM?.removeEventListener("scroll", refreshProgress);
		window.removeEventListener("resize", refreshProgress);
		document.removeEventListener("pointerdown", onPointerDown, true);
		document.removeEventListener("pointerup", onPointerUp, true);
		document.removeEventListener("pointercancel", onPointerCancel, true);
		onPointerCancel();
		lastTap = 0;
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
		bookmarks.close();
		const file = manager.activeFile;
		if (file?.type !== "editor" || file.loading) return;
		const pane = manager.getFilePane(file);
		if (!pane?.element?.parentNode) return;
		if (pane.editor?.scrollDOM) pane.editor.__bookmarkNormalViewportTop = pane.editor.scrollDOM.getBoundingClientRect().top;
		const restoreScroll = captureScroll(pane);
		if (file.editable) exec("read-only");
		fullscreenFile = file;
		fullscreenPane = pane;
		placeholder = document.createComment("fullscreen editor pane");
		pane.element.replaceWith(placeholder);
		pane.editor?.contentDOM.blur();
		pane.element.classList.add("editor-content-fullscreen");
		document.body.classList.add("editor-content-fullscreen-mode");
		document.body.append(pane.element, status, exitButton);
		restoreScroll();
		native("editor-immersive", [true], () => pane.editor?.requestMeasure());
		pane.editor?.scrollDOM?.addEventListener("scroll", refreshProgress, { passive: true });
		window.addEventListener("resize", refreshProgress);
		progress.hidden = false;
		document.body.classList.remove("app-dark-status-mode");
		clearInterval(statusTimer);
		refreshStatus();
		statusTimer = setInterval(refreshStatus, 15000);
		showExitHint();
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("pointerup", onPointerUp, true);
		document.addEventListener("pointercancel", onPointerCancel, true);
		fullscreenButton.setAttribute("aria-pressed", "true");
		pane.editor?.requestMeasure();
		document.addEventListener("keydown", onKeyDown, true);
		update();
	}
	function update() {
		syncNormalStatus();
		const file = manager.activeFile;
		bookmarks.update();
		bookmarkList.disabled = bookmarkAdd.disabled = !bookmarks.available();
		if (fullscreenPane && file !== fullscreenFile) exit();
		if (fullscreenPane && file?.editable) file.editable = false;
		if (file?.type !== "editor" || !pencil.isConnected) {
			readOnlyButton.remove();
			fullscreenButton.remove();
			bookmarkList.remove();
			bookmarkAdd.remove();
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
		header.insertBefore(bookmarkList, pencil.nextSibling);
		header.insertBefore(bookmarkAdd, bookmarkList.nextSibling);
		header.insertBefore(readOnlyButton, bookmarkAdd.nextSibling);
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
		if (file === manager.activeFile) bookmarks.close();
	});
	return { update, enter, exit, readOnlyButton, fullscreenButton, exitButton, bookmarkList, bookmarkAdd, bookmarks };
}
