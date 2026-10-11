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
