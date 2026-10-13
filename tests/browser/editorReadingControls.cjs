// Run after Rspack builds www/build/main.css. Requires Playwright and Chromium.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { rspack } = require("@rspack/core");

async function run() {
	const repo = path.resolve(__dirname, "../..");
	const temporary = fs.mkdtempSync(
		path.join(os.tmpdir(), "acode-reading-controls-"),
	);
	let browser;
	try {
		await new Promise((resolve, reject) => {
			const compiler = rspack({
				mode: "development",
				entry: path.join(__dirname, "fixtures/editorReadingControls.js"),
				output: { path: temporary, filename: "bundle.js" },
				resolve: {
					modules: [path.join(repo, "node_modules")],
					extensions: [".ts", ".js"],
				},
				module: {
					rules: [
						{
							test: /\.ts$/,
							use: {
								loader: "builtin:swc-loader",
								options: { jsc: { parser: { syntax: "typescript" } } },
							},
						},
					],
				},
			});
			compiler.run((error, stats) => {
				compiler.close(() => {
					if (error || stats.hasErrors())
						reject(error || new Error(stats.toString()));
					else resolve();
				});
			});
		});
		browser = await chromium.launch({
			executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
			headless: true,
			args: ["--no-sandbox"],
		});
		const page = await browser.newPage({
			viewport: { width: 412, height: 732 },
			hasTouch: true,
		});
		page.setDefaultTimeout(5000);
		await page.setContent('<html><body style="margin:0"></body></html>');
		await page.addStyleTag({
			content: fs.readFileSync(path.join(repo, "www/build/main.css"), "utf8"),
		});
		await page.addScriptTag({
			content: fs.readFileSync(path.join(temporary, "bundle.js"), "utf8"),
		});
		await page.evaluate(() => setupReading());
		await page.waitForTimeout(150);

  // Bookmarks follow scrolling, preserve the document, and use the requested drawer layout.
  const beforeBookmarks = await page.evaluate(() => reading.view.state.doc.toString());
  const expectedThumbBookmarks = [];
  for (const line of [100, 20]) {
   await page.evaluate(line => { const view = reading.view; view.dispatch({ selection: { anchor: 0 } }); view.scrollDOM.scrollTop = view.lineBlockAt(view.state.doc.line(line).from).top; }, line);
   await page.waitForTimeout(150);
   expectedThumbBookmarks.push(await page.evaluate(() => {
    const view = reading.view;
    const rect = document.getElementById("bookmark-test-thumb").getBoundingClientRect();
    return view.posAtCoords({ x: view.contentDOM.getBoundingClientRect().left + 1, y: (rect.top + rect.bottom) / 2 });
   }));
   await page.locator("#editor-bookmark-add").tap();
   await page.waitForTimeout(250);
   await page.touchscreen.tap(400, 600);

   await page.waitForTimeout(250);
  }
  await page.locator("#editor-bookmark-list").tap();
  await page.waitForTimeout(250);
  const bookmarkLayout = await page.locator(".editor-bookmark-panel").evaluate(panel => ({ width: panel.getBoundingClientRect().width, height: panel.getBoundingClientRect().height, background: getComputedStyle(panel).backgroundColor }));
  assert(Math.abs(bookmarkLayout.width - (412 * 2 / 3 - 15)) < 1);
  assert.equal(bookmarkLayout.height, 732);
  assert.equal(bookmarkLayout.background, "rgb(223, 223, 223)");
  const bookmarkPositions = await page.evaluate(() => reading.control.bookmarks.store.list("untitled:reading-browser-fixture").map(item => item.position));
  assert.deepEqual(bookmarkPositions, expectedThumbBookmarks.sort((a,b)=>a-b));
  assert.equal(await page.locator(".editor-bookmark-row").count(), 2);
  assert.equal(await page.locator(".editor-bookmark-excerpt").first().evaluate(el => getComputedStyle(el).fontSize), "15px");
  assert.equal(await page.locator(".editor-bookmark-overlay").evaluate(el => getComputedStyle(el).backdropFilter), "blur(4px)");
  assert.equal(await page.evaluate(() => reading.main.inert), true);
  await page.screenshot({ path: "/tmp/acode-bookmarks-preview.png" });
  await page.locator(".editor-bookmark-options").first().tap();
  await page.getByRole("button", { name: "编辑", exact: true }).tap();
  assert.deepEqual(await page.locator(".editor-bookmark-edit-actions button").allTextContents(), ["取消", "保存"]);
  const actionGap = await page.locator(".editor-bookmark-edit-actions").evaluate(el => { const [a,b] = el.children; return b.getBoundingClientRect().left - a.getBoundingClientRect().right; });
  assert.equal(actionGap, 35);
  await page.locator(".editor-bookmark-row textarea").fill("字".repeat(51));
  assert.equal(await page.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  await page.locator(".editor-bookmark-row textarea").fill("自定义书签");
  await page.getByRole("button", { name: "保存", exact: true }).tap();
  assert.equal(await page.locator(".editor-bookmark-excerpt").first().textContent(), "自定义书签");
  await page.getByRole("button", { name: "全选", exact: true }).tap();
  assert.equal(await page.locator(".editor-bookmark-checkbox:checked").count(), 2);
  await page.touchscreen.tap(400, 600);

  await page.waitForTimeout(250);
  await page.locator("#editor-bookmark-list").tap();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".editor-bookmark-checkbox").count(), 0);
  await page.getByRole("button", { name: "全选", exact: true }).tap();
  await page.locator(".editor-bookmark-toolbar").getByRole("button", { name: "删除", exact: true }).tap();
  const confirmation = await page.getByRole("alertdialog").evaluate(el => {
    const rect = el.getBoundingClientRect();
    const buttons = [...el.querySelectorAll("button")].map(button => button.getBoundingClientRect());
    return { width: rect.width, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      gap: buttons[1].left - buttons[0].right, alignment: getComputedStyle(el).textAlign,
      buttonCenter: (buttons[0].left + buttons[1].right) / 2, screenWidth: innerWidth, screenHeight: innerHeight };
  });
  assert.equal(confirmation.width, Math.min(confirmation.screenWidth * 0.6375, 240));
  assert.equal(confirmation.x, confirmation.screenWidth / 2);
  assert.equal(confirmation.y, confirmation.screenHeight / 2);
  assert.equal(confirmation.buttonCenter, confirmation.x);
  assert.equal(confirmation.gap, 30);
  assert.equal(confirmation.alignment, "center");
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).tap();
  assert.equal(await page.locator(".editor-bookmark-row").count(), 2);
  await page.locator(".editor-bookmark-toolbar").getByRole("button", { name: "删除", exact: true }).tap();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).tap();
  assert.equal(await page.locator(".editor-bookmark-row").count(), 0);
  await page.touchscreen.tap(400, 600);

  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => reading.view.state.doc.toString()), beforeBookmarks);
  await page.evaluate(() => { reading.view.scrollDOM.scrollTop = 0; reading.view.dispatch({ selection: { anchor: 0 } }); });
  await page.waitForTimeout(150);

		await page.locator("#editor-read-only-toggle").tap();
		await page.evaluate(() => {
			reading.setAppearance({ editorActiveLineColor: "#22bb66", editorSelectionColor: "#ffee00", editorCursorColor: "#ff0000", cursorWidth: 4, editorPaddingTop: 22, editorPaddingBottom: 18 });
			reading.view.focus();
			reading.view.dispatch({ selection: { anchor: 2, head: 8 } });
		});
		await page.waitForTimeout(150);
		assert.equal(await page.locator(".cm-selectionBackground").first().evaluate(el => getComputedStyle(el).backgroundColor), "rgb(255, 238, 0)");
		assert.equal(await page.locator(".cm-line").first().evaluate(el => getComputedStyle(el, "::selection").backgroundColor), "rgb(255, 238, 0)");
		await page.evaluate(() => reading.view.dispatch({ selection: { anchor: 2 } }));
		await page.waitForTimeout(150);
		const clicked = await page.evaluate(() => {
			const rect = reading.view.coordsAtPos(8);
			return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
		});
		await page.touchscreen.tap(clicked.x, clicked.y);
		await page.waitForTimeout(150);
		assert.equal(await page.locator(".cm-activeLine").first().evaluate(el => getComputedStyle(el).backgroundColor), "rgb(34, 187, 102)");
		const cursorStyle = await page.locator(".cm-cursor").first().evaluate(el => ({ color: getComputedStyle(el).borderLeftColor, width: getComputedStyle(el).borderLeftWidth }));
		assert.equal(cursorStyle.color, "rgb(255, 0, 0)");
		assert.equal(cursorStyle.width, "4px");
		await page.locator("#editor-content-fullscreen-toggle").tap();
		await page.waitForTimeout(150);
		assert.equal(await page.locator(".cm-activeLine").first().evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
		const margins = await page.evaluate(() => {
			const status = document.getElementById("editor-fullscreen-status");
			const bar = status.getBoundingClientRect();
			const icon = status.querySelector("time").getBoundingClientRect();
			const scroll = reading.view.scrollDOM.getBoundingClientRect();
			return { top: scroll.top - bar.bottom, bottom: innerHeight - scroll.bottom, belowIcon: bar.bottom - icon.bottom, aboveIcon: icon.top };
		});
		assert.deepEqual(margins, { top: 22, bottom: 18, belowIcon: 6, aboveIcon: 5 });
  assert.equal(await page.locator("#editor-fullscreen-status").evaluate(el => getComputedStyle(el, "::before").height), "23px");
  assert.equal(await page.locator(".editor-content-fullscreen .cm-editor").evaluate(el => getComputedStyle(el).paddingTop), "45px");
  assert.equal(await page.locator(".editor-content-fullscreen .cm-content").evaluate(el => getComputedStyle(el).paddingTop), "0px");
  await page.evaluate(() => reading.setAppearance({ editorPaddingTop: 40, editorPaddingBottom: 18 }));
  assert.equal(await page.locator(".editor-content-fullscreen .cm-content").evaluate(el => getComputedStyle(el).paddingTop), "0px");
  assert.equal(await page.locator("#editor-fullscreen-status").evaluate(el => el.getBoundingClientRect().height), 23);
  assert.equal(await page.locator(".cm-scroller").evaluate(el => el.getBoundingClientRect().top), 63);
  await page.evaluate(() => reading.setAppearance({ editorPaddingTop: 22, editorPaddingBottom: 18 }));
  await page.screenshot({ path: "/tmp/acode-status-preview.png" });

  const statusGaps = await page.evaluate(() => {
   const status = document.getElementById("editor-fullscreen-status");
   const clock = status.querySelector("time").getBoundingClientRect();
   const battery = status.querySelector(".editor-fullscreen-battery").getBoundingClientRect();
   const percentage = status.querySelector(".editor-fullscreen-battery-percentage").getBoundingClientRect();
   const progress = status.querySelector(".editor-fullscreen-progress").getBoundingClientRect();
   return [battery.left - clock.right, percentage.left - battery.right, progress.left - percentage.right];
  });
  assert.deepEqual(statusGaps, [15, 6, 15]);
  await page.evaluate(() => {
   const view = reading.view;
   view.scrollDOM.scrollTop = view.lineBlockAt(view.state.doc.line(101).from).top;
  });
  await page.waitForTimeout(150);
  const expectedProgress = await page.evaluate(() => {
   const view = reading.view;
   const block = view.lineBlockAtHeight(Math.max(0, view.scrollDOM.getBoundingClientRect().top - view.documentTop));
   return Math.round((view.state.doc.lineAt(block.from).number - 1) / (view.state.doc.lines - 1) * 100) + "%";
  });
  assert.equal(await page.locator(".editor-fullscreen-progress-percentage").textContent(), expectedProgress);
  assert.notEqual(expectedProgress, "0%");
  await page.evaluate(() => { reading.view.scrollDOM.scrollTop = 0; });
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".editor-fullscreen-progress-percentage").textContent(), "0%");

		await page.touchscreen.tap(392, 20);
		await page.evaluate(() => reading.setAppearance({}));
		await page.waitForTimeout(150);

		// Preserve the visible text anchor, including a page reached in fullscreen.
		const scrollPosition = () => page.evaluate(() => {
			const view = reading.view;
			const top = view.scrollDOM.getBoundingClientRect().top;
			const line = [...view.contentDOM.querySelectorAll(".cm-line")]
				.find((el) => el.getBoundingClientRect().bottom > top + 1);
			return { pos: view.posAtDOM(line), offset: line.getBoundingClientRect().top - top };
		});
		const originalDocument = await page.evaluate(() => reading.view.state.doc.toString());
		for (const scenario of [
			{ editable: false, wrap: false },
			{ editable: true, wrap: false },
			{ editable: false, wrap: true },
			{ editable: true, wrap: true },
		]) {
			const { editable, wrap } = scenario;
			await page.evaluate((wrap) => {
				reading.setLayout(Array.from({ length: 200 }, (_, i) =>
					`paragraph ${i} ` + "long wrapped text ".repeat(8)).join("\n"), wrap, 1.73, 18);
			}, wrap);
			if (editable) await page.locator("#editor-read-only-toggle").tap();
			await page.evaluate(() => {
				reading.setPaging(true, 0);
				reading.view.scrollDOM.scrollTop = 900;
			});
			await page.waitForTimeout(200);
			const beforeEntry = await scrollPosition();
			await page.locator("#editor-content-fullscreen-toggle").tap();
			await page.waitForTimeout(200);
			const afterEntry = await scrollPosition();
			assert.equal(afterEntry.pos, beforeEntry.pos, "entry must retain visible line");
			assert(Math.abs(afterEntry.offset - beforeEntry.offset) < 1, JSON.stringify({scenario,beforeEntry,afterEntry}));
			await page.touchscreen.tap(360, 300);
			await page.waitForTimeout(200);
			const beforeExit = await scrollPosition();
			assert(beforeExit.pos > afterEntry.pos, "fullscreen tap must advance page");
			await page.touchscreen.tap(392, 20);
			await page.waitForTimeout(200);
			const afterExit = await scrollPosition();
			assert.equal(afterExit.pos, beforeExit.pos, "exit must retain current page");
			assert(Math.abs(afterExit.offset - beforeExit.offset) < 1);
		}
		await page.evaluate((doc) => {
			reading.setLayout(doc, false, 1.4, 0);
			reading.setPaging(false, 60);
			reading.view.scrollDOM.scrollTop = 0;
		}, originalDocument);
		await page.waitForTimeout(200);

		// Use the real header.tile and compiled application CSS: .click() in a
		// DOM-only unit test bypasses hit testing and misses pointer-events bugs.
		for (const id of [
			"editor-read-only-toggle",
			"editor-content-fullscreen-toggle",
		]) {
			assert.equal(
				await page.evaluate((id) => {
					const button = document.getElementById(id);
					const rect = button.getBoundingClientRect();
					return (
						document.elementFromPoint(
							rect.x + rect.width / 2,
							rect.y + rect.height / 2,
						) === button
					);
				}, id),
				true,
				`${id} must receive pointer events`,
			);
		}
		const before = await page.evaluate(
			() => reading.view.state.selection.main.head,
		);
		await page.locator(".cm-line").first().tap();
		await page.locator(".cm-line").first().dblclick();
		await page.locator(".cm-line").first().click({ button: "right" });
		assert.equal(
			await page.evaluate(() => reading.view.state.selection.main.head),
			before,
		);
		assert.equal(
			await page.evaluate(
				() =>
					getComputedStyle(reading.view.dom.querySelector(".cm-cursorLayer"))
						.display,
			),
			"none",
		);
		assert.equal(
			await page.evaluate(
				() =>
					getComputedStyle(reading.view.dom.querySelector(".cm-activeLine"))
						.backgroundColor,
			),
			"rgba(0, 0, 0, 0)",
		);
		await page.locator(".cm-scroller").hover();
		await page.mouse.wheel(0, 250);
		await page.waitForTimeout(150);
		assert((await page.evaluate(() => reading.view.scrollDOM.scrollTop)) > 0);

		await page.locator("#editor-content-fullscreen-toggle").tap();
		await page.waitForTimeout(100);
		const rect = await page.locator(".editor-content-fullscreen").boundingBox();
		assert.deepEqual(rect, { x: 0, y: 0, width: 412, height: 732 });
		assert.equal(await page.locator(".editor-pane-tabs").isVisible(), false);
		assert.equal(await page.locator("#editor-fullscreen-status").count(), 1);
		assert.equal(
			await page
				.locator("#editor-fullscreen-status")
				.evaluate((el) => getComputedStyle(el).fontSize),
			"12px",
		);
		const statusRect = await page
			.locator("#editor-fullscreen-status")
			.boundingBox();
		const scrollerRect = await page.locator(".cm-scroller").boundingBox();
		assert.equal(statusRect.y, 0);
		assert.equal(statusRect.height, 23);
		assert.equal(scrollerRect.y - (statusRect.y + statusRect.height), 30);
		assert.equal(scrollerRect.y + scrollerRect.height, 732);
		await page.waitForTimeout(4000);
		assert.equal(
			await page
				.locator("#editor-content-fullscreen-exit")
				.evaluate((el) => getComputedStyle(el).opacity),
			"0",
		);
		assert.equal(
			await page.evaluate(() => document.elementFromPoint(392, 20).id),
			"editor-content-fullscreen-exit",
		);
		for (let i = 0; i < 4; i++) await page.touchscreen.tap(200, 200);
		assert.equal(await page.locator("#editor-content-fullscreen-exit").evaluate(el => getComputedStyle(el).opacity), "0.65");
		await page.waitForTimeout(4100);
		assert.equal(await page.locator("#editor-content-fullscreen-exit").evaluate(el => getComputedStyle(el).opacity), "0");
		await page.touchscreen.tap(392, 20);
		assert.equal(await page.locator(".editor-content-fullscreen").count(), 0);
		assert.equal(
			await page.evaluate(
				() => reading.pane.element.parentNode === reading.main,
			),
			true,
		);

		await page.evaluate(() => reading.setPaging(true, 0));
		await page.locator("#editor-read-only-toggle").tap();
		await page.waitForTimeout(150);
		assert.equal(await page.evaluate(() => reading.file.editable), true);
		assert.equal(await page.evaluate(() => reading.view.state.readOnly), false);
		assert.equal(await page.locator(".cm-page-turning").count(), 0);
		await page.evaluate(() => {
			reading.view.scrollDOM.scrollTop = 0;
		});
		await page.waitForTimeout(150);
		const point = await page.evaluate(() => {
			const rect = reading.view.coordsAtPos(2);
			return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
		});
		await page.touchscreen.tap(point.x, point.y);
		assert.equal(await page.evaluate(() => reading.view.hasFocus), true);
		await page.keyboard.type("__editable__");
		assert.equal(
			await page.evaluate(() =>
				reading.view.state.doc.toString().includes("__editable__"),
			),
			true,
		);
		await page.locator("#editor-content-fullscreen-toggle").tap();
		assert.equal(await page.evaluate(() => reading.file.editable), false);
		assert.equal(await page.evaluate(() => reading.view.state.readOnly), true);
		assert.equal(
			await page.locator(".cm-content").getAttribute("contenteditable"),
			"false",
		);
		await page.evaluate(() => reading.control.readOnlyButton.click());
		assert.equal(await page.evaluate(() => reading.view.state.readOnly), true);
		await page.touchscreen.tap(392, 20);
		assert.equal(await page.evaluate(() => reading.file.editable), false);
		await page.locator("#editor-content-fullscreen-toggle").tap();
		await page.evaluate(() => {
			reading.setPaging(true, 60);
			reading.view.scrollDOM.scrollTop = 0;
		});
		const client = await page.context().newCDPSession(page);
		async function swipe(x, dx, dy = 0) {
			await client.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: [{ x, y: 200 }],
			});
			for (let n = 1; n <= 8; n++) {
				await client.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [{ x: x + (dx * n) / 8, y: 200 + (dy * n) / 8 }],
				});
			}
			await client.send("Input.dispatchTouchEvent", {
				type: "touchEnd",
				touchPoints: [],
			});
		}
		await page.waitForTimeout(150);
		await page.evaluate(() => { reading.setPaging(true, 60, true); reading.view.scrollDOM.scrollTop = 400; });
		await page.waitForTimeout(150);
		const lockedTop = await page.evaluate(() => reading.view.scrollDOM.scrollTop);
		await swipe(200, 0, -140);
		await page.locator(".cm-scroller").hover();
		await page.mouse.wheel(0, 200);
		await page.waitForTimeout(200);
		assert.equal(await page.evaluate(() => reading.view.scrollDOM.scrollTop), lockedTop, "fullscreen lock must block vertical touch and wheel scrolling");
		await swipe(360, -100);
		await page.waitForTimeout(150);
		assert((await page.evaluate(() => reading.view.scrollDOM.scrollTop)) > lockedTop, "horizontal paging must work while locked");
		await page.touchscreen.tap(392, 20);
		await page.waitForTimeout(150);
		const outsideTop = await page.evaluate(() => reading.view.scrollDOM.scrollTop);
		await page.locator(".cm-scroller").hover();
		await page.mouse.wheel(0, 150);
		await page.waitForTimeout(150);
		assert((await page.evaluate(() => reading.view.scrollDOM.scrollTop)) > outsideTop, "exit must restore vertical scrolling even with preference enabled");
		await page.locator("#editor-content-fullscreen-toggle").tap();
		await page.evaluate(() => reading.setPaging(true, 60, false));
		await page.waitForTimeout(150);
		const unlockedTop = await page.evaluate(() => reading.view.scrollDOM.scrollTop);
		await page.locator(".cm-scroller").hover();
		await page.mouse.wheel(0, 150);
		await page.waitForTimeout(150);
		assert((await page.evaluate(() => reading.view.scrollDOM.scrollTop)) > unlockedTop, "turning off lock must restore fullscreen scrolling");
		await page.evaluate(() => { reading.view.scrollDOM.scrollTop = 0; });
		await page.waitForTimeout(150);
		const nextPageTop = await page.evaluate(() => {
			const root = reading.view.scrollDOM;
			const box = root.getBoundingClientRect();
			const partial = [...reading.view.contentDOM.querySelectorAll(".cm-line")]
				.map((line) => line.getBoundingClientRect())
				.find(
					(row) =>
						row.top > box.top &&
						row.top < box.bottom &&
						row.bottom > box.bottom + 0.5,
				);
			return (
				root.scrollTop + (partial ? partial.top - box.top : root.clientHeight)
			);
		});
		await swipe(360, -100);
		await page.waitForTimeout(150);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			Math.round(nextPageTop),
		);
		await swipe(50, 100);
		await page.waitForTimeout(150);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			0,
		);
		for (const [leftStart, rightStart] of [[150, 50], [360, 300]]) {
			await swipe(leftStart, -100);
			await page.waitForTimeout(150);
			assert((await page.evaluate(() => reading.view.scrollDOM.scrollTop)) > 0, "left swipe advances from either half");
			await swipe(rightStart, 100);
			await page.waitForTimeout(150);
			assert.equal(await page.evaluate(() => reading.view.scrollDOM.scrollTop), 0, "right swipe goes back from either half");
		}
		await swipe(360, -40);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			0,
		);
		await swipe(50, -40);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			0,
		);
		await page.evaluate(() => reading.setPaging(true, 0));
		await page.touchscreen.tap(360, 200);
		await page.waitForTimeout(150);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			Math.round(nextPageTop),
		);
		await page.touchscreen.tap(50, 200);
		await page.waitForTimeout(150);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			0,
		);
		await page.evaluate(() => reading.setPaging(false, 0));
		await page.waitForTimeout(150);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.style.clipPath),
			"",
		);
		assert.equal(
			await page.evaluate(() =>
				reading.view.scrollDOM.style.getPropertyValue("--cm-page-tail"),
			),
			"",
		);
		await page.touchscreen.tap(360, 200);
		await page.waitForTimeout(150);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			0,
		);
		assert.equal(await page.locator(".cm-page-turning").count(), 0);
		await page.locator(".cm-scroller").hover();
		await page.mouse.wheel(0, 250);
		await page.waitForTimeout(150);
		assert((await page.evaluate(() => reading.view.scrollDOM.scrollTop)) > 0);
		await page.touchscreen.tap(392, 20);
		await page.locator("#editor-read-only-toggle").tap();
		await page.evaluate(() => {
			reading.setPaging(true, 60);
			reading.view.scrollDOM.scrollTop = 0;
		});
		await swipe(360, -100);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			0,
		);
		assert.equal(await page.locator(".cm-page-turning").count(), 0);
		await page.locator(".cm-scroller").hover();
		await page.mouse.wheel(0, 250);
		await page.waitForTimeout(150);
		assert((await page.evaluate(() => reading.view.scrollDOM.scrollTop)) > 0);

		// Verify visible spacing changes on ordinary Enter-separated paragraphs.
		for (const wrap of [false, true]) {
			for (const blank of [false, true]) {
				const heights = [];
				for (const spacing of [0, 18, 40, 0]) {
					await page.evaluate(
						({ wrap, blank, spacing }) => {
							const first = wrap
								? "wrapped paragraph words ".repeat(12)
								: "first paragraph";
							reading.setLayout(
								first + (blank ? "\n\n" : "\n") + "second paragraph",
								wrap,
								1.73,
								spacing,
							);
							reading.view.scrollDOM.scrollTop = 0;
						},
						{ wrap, blank, spacing },
					);
					await page.waitForTimeout(150);
					const geometry = await page.evaluate(() => {
						const lines = [
							...reading.view.contentDOM.querySelectorAll(".cm-line"),
						].filter((line) => line.textContent.trim());
						const range = document.createRange();
						range.selectNodeContents(lines[0]);
						const first = [...range.getClientRects()].filter(
							(rect) => rect.width > 0,
						);
						range.selectNodeContents(lines[1]);
						const second = [...range.getClientRects()].find(
							(rect) => rect.width > 0,
						);
						return {
							gap: second.top - first[first.length - 1].top,
							wrapStep: first.length > 1 ? first[1].top - first[0].top : null,
						};
					});
					heights.push(geometry);
				}
				assert(Math.abs(heights[1].gap - heights[0].gap - 18) < 0.5);
				assert(Math.abs(heights[2].gap - heights[0].gap - 40) < 0.5);
				assert(Math.abs(heights[3].gap - heights[0].gap) < 0.5);
				if (wrap)
					assert(
						Math.abs(heights[2].wrapStep - heights[0].wrapStep) < 0.5,
						"Paragraph spacing must not increase soft-wrapped row spacing",
					);
			}
		}
		// Fractional row heights, wrapping and paragraph gaps must never split text.
		await page.locator("#editor-content-fullscreen-toggle").tap();
		for (const wrap of [false, true]) {
			await page.evaluate((wrap) => {
				const doc = Array.from(
					{ length: 30 },
					(_, n) => `Paragraph ${n}: ` + "wrapped words ".repeat(wrap ? 20 : 2),
				).join("\n\n");
				reading.setLayout(doc, wrap, 1.73, 13);
				reading.setPaging(true, 0);
				reading.view.scrollDOM.scrollTop = 0;
			}, wrap);
			await page.waitForTimeout(200);
			for (let n = 0; n < 24; n++) {
				const boundary = await page.evaluate(() => {
					const root = reading.view.scrollDOM,
						box = root.getBoundingClientRect();
					const match = root.style.clipPath.match(/inset\(([^)]+)\)/);
					const clip = match
						? Number.parseFloat(match[1].split(" ")[2] || match[1])
						: 0;
					const effectiveBottom = box.top + root.clientHeight - clip;
					const glyphs = [
						...reading.view.contentDOM.querySelectorAll(".cm-line"),
					].flatMap((line) => {
						const range = document.createRange();
						range.selectNodeContents(line);
						return [...range.getClientRects()].filter(
							(rect) => rect.width > 0 && rect.height > 0,
						);
					});
					const cuts = glyphs.filter(
						(rect) =>
							rect.top < effectiveBottom - 0.5 &&
							rect.bottom > effectiveBottom + 0.5,
					);
					const firstHidden = glyphs
						.filter((rect) => rect.top >= effectiveBottom - 0.5)
						.sort((a, b) => a.top - b.top)[0];
					const terminal =
						reading.view.viewport.to === reading.view.state.doc.length &&
						reading.view.contentDOM
							.querySelector(".cm-line:last-child")
							.getBoundingClientRect().bottom <=
							effectiveBottom + 0.5;
					return {
						terminal,
						cuts: cuts.length,
						scroll: root.scrollTop,
						next: terminal
							? root.scrollTop
							: root.scrollTop + effectiveBottom - box.top,
						hiddenTop: firstHidden?.top,
						top: box.top,
					};
				});
				assert.equal(
					boundary.cuts,
					0,
					"No glyph may straddle the visible bottom edge",
				);
				await page.touchscreen.tap(360, 200);
				await page.waitForTimeout(200);
				const actualNext = await page.evaluate(
					() => reading.view.scrollDOM.scrollTop,
				);
				assert(
					Math.abs(actualNext - boundary.next) <= 1,
					JSON.stringify({ wrap, n, boundary, actualNext }),
				);
				const topCuts = await page.evaluate(() => {
					const top = reading.view.scrollDOM.getBoundingClientRect().top;
					return [...reading.view.contentDOM.querySelectorAll(".cm-line")]
						.flatMap((line) => {
							const range = document.createRange();
							range.selectNodeContents(line);
							return [...range.getClientRects()];
						})
						.filter(
							(rect) =>
								rect.width > 0 &&
								rect.top < top - 0.5 &&
								rect.bottom > top + 0.5,
						).length;
				});
				assert.equal(
					topCuts,
					0,
					"Next page must not start with a clipped glyph",
				);
				if (boundary.terminal) break;
			}
			// Previous-page navigation restores an actual earlier page boundary.
			await page.touchscreen.tap(50, 200);
			await page.waitForTimeout(200);
		}
		await page.screenshot({ path: "/tmp/acode-full-row-preview.png" });
		await page.touchscreen.tap(392, 20);
		await page.locator("#editor-read-only-toggle").tap();
		await page.screenshot({ path: "/tmp/acode-toolbar-preview.png" });
		assert.equal(await page.locator(".editor-mode-pencil").count(), 1);
		assert.notEqual(
			await page
				.locator(".editor-mode-pencil")
				.evaluate((el) => getComputedStyle(el, "::before").maskImage),
			"none",
		);

    // The user-set top space belongs to the viewport, across every navigation path.
    await page.locator("#editor-content-fullscreen-toggle").tap();
    async function assertPersistentTopSpace(padding, context) {
      await page.waitForTimeout(180);
      const geometry = await page.evaluate(() => {
        const view = reading.view;
        const bar = document.getElementById("editor-fullscreen-status").getBoundingClientRect();
        const scroll = view.scrollDOM.getBoundingClientRect();
        const clock = document.querySelector("#editor-fullscreen-status time").getBoundingClientRect();
        const hit = document.elementFromPoint(100, scroll.top - 1);
        return { gap: scroll.top - bar.bottom, statusHeight: bar.height, belowIcon: bar.bottom - clock.bottom,
          contentPadding: getComputedStyle(view.contentDOM).paddingTop,
          textInGap: !!hit?.closest(".cm-scroller"), scrollTop: view.scrollDOM.scrollTop };
      });
      assert.equal(geometry.gap, padding, context);
      assert.equal(geometry.statusHeight, 23, context);
      assert.equal(geometry.belowIcon, 6, context);
      assert.equal(geometry.contentPadding, "0px", context);
      assert.equal(geometry.textInGap, false, context);
      return geometry.scrollTop;
    }
    for (const wrap of [false, true]) {
      await page.evaluate(wrap => {
        reading.setLayout(Array.from({ length: 200 }, (_, i) => `paragraph ${i} ` + "wrapped reading text ".repeat(6)).join("\n"), wrap, 1.73, 18, 47);
        reading.setPaging(true, 0);
        reading.view.scrollDOM.scrollTop = 0;
      }, wrap);
      await assertPersistentTopSpace(47, `first page, wrap=${wrap}`);
      for (let n = 0; n < 3; n++) {
        await page.touchscreen.tap(360, 200);
        assert(await assertPersistentTopSpace(47, `tap next ${n}, wrap=${wrap}`) > 0);
      }
      await page.touchscreen.tap(50, 200);
      await assertPersistentTopSpace(47, `tap previous, wrap=${wrap}`);
      for (const lock of [false, true]) {
        await page.evaluate(lock => reading.setPaging(true, 60, lock), lock);
        await swipe(360, -100);
        await assertPersistentTopSpace(47, `swipe next, lock=${lock}, wrap=${wrap}`);
        await swipe(50, 100);
        await assertPersistentTopSpace(47, `swipe previous, lock=${lock}, wrap=${wrap}`);
      }
      await page.evaluate(() => reading.setPaging(false, 60));
      await page.locator(".cm-scroller").hover();
      await page.mouse.wheel(0, 250);
      await assertPersistentTopSpace(47, `wheel, wrap=${wrap}`);
      await swipe(200, 0, -120);
      await page.waitForTimeout(500);
      await assertPersistentTopSpace(47, `vertical touch, wrap=${wrap}`);
      for (const fraction of [0.1, 0.55, 1, 0]) {
        await page.evaluate(fraction => {
          const root = reading.view.scrollDOM;
          root.scrollTop = fraction * (root.scrollHeight - root.clientHeight);
        }, fraction);
        await assertPersistentTopSpace(47, `scrollbar fraction=${fraction}, wrap=${wrap}`);
      }
      await page.evaluate(() => reading.view.dispatch({ effects: window.readingScrollIntoView(reading.view.state.doc.line(120).from) }));
      await assertPersistentTopSpace(47, `jump to text, wrap=${wrap}`);
    }
    for (const padding of [0, 12, 80, 30]) {
      await page.evaluate(padding => reading.setAppearance({ editorPaddingTop: padding }), padding);
      await assertPersistentTopSpace(padding, `change setting at current page to ${padding}`);
    }
    await page.screenshot({ path: "/tmp/acode-status-preview.png" });
    await page.touchscreen.tap(392, 20);

    const restart = await page.evaluate(() => window.testReadingRestart());
    assert.deepEqual(restart.readOnly, [true, true]);
    assert.deepEqual(restart.fullscreen, [false, false]);
    for (let i = 0; i < 2; i++) {
      assert.equal(restart.after[i].from, restart.before[i].from, JSON.stringify(restart));
      assert(Math.abs(restart.after[i].offset - restart.before[i].offset) < 1, JSON.stringify(restart));
    }
    assert.equal(restart.closedPosition, null);
    assert.equal(restart.reopenedTop, 0);

    for (const wrap of [false, true]) {
      const tabs = await page.evaluate(wrap => window.testSharedReadingTabs(wrap), wrap);
      const assertTab = (actual, index, phase) => {
        const expected = tabs.expected[index];
        assert.equal(actual.from, expected.from, `${phase}, file ${index}, wrap=${wrap}`);
        assert(Math.abs(actual.offset - expected.offset) < 1, JSON.stringify({ phase, index, wrap, expected, actual }));
        assert(Math.abs(actual.pixel - expected.pixel) < 1, JSON.stringify({ phase, index, wrap, expected, actual }));
      };
      for (const item of tabs.switches) assertTab(item.position, item.index, "repeated shared-view switch");
      tabs.restarted.forEach((position, index) => assertTab(position, index, "restart with file 1 initially active"));
      for (const item of tabs.restartSwitches) assertTab(item.position, item.index, "shared-view switch after restart");
    }
		console.log(
			"Browser regression passed: real toolbar hit testing, both touch buttons, fullscreen exit, read-only selection guard, scrolling, editable text input, paging swipes, tap paging and paging disable.",
		);
	} finally {
		await browser?.close();
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
