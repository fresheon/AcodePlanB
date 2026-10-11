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
		assert.equal(statusRect.y, 5);
		assert.equal(statusRect.height, 12);
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
		await page.touchscreen.tap(392, 20);
		assert.equal(await page.locator(".editor-content-fullscreen").count(), 0);
		assert.equal(
			await page.evaluate(
				() => reading.pane.element.parentNode === reading.main,
			),
			true,
		);

		await page.locator("#editor-read-only-toggle").tap();
		await page.waitForTimeout(150);
		assert.equal(await page.evaluate(() => reading.file.editable), true);
		assert.equal(await page.evaluate(() => reading.view.state.readOnly), false);
		await page.evaluate(() => {
			reading.view.scrollDOM.scrollTop = 0;
		});
		await page.waitForTimeout(150);
		const point = await page.evaluate(() => {
			const rect = reading.view.coordsAtPos(2);
			return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
		});
		await page.touchscreen.tap(point.x, point.y);
		await page.keyboard.type("__editable__");
		assert.equal(
			await page.evaluate(() =>
				reading.view.state.doc.toString().includes("__editable__"),
			),
			true,
		);
		await page.locator("#editor-read-only-toggle").tap();
		assert.equal(await page.evaluate(() => reading.view.state.readOnly), true);
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
		const pageHeight = await page.evaluate(
			() => reading.view.scrollDOM.clientHeight,
		);
		await swipe(360, -100);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			pageHeight,
		);
		await swipe(50, 100);
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
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			pageHeight,
		);
		await page.touchscreen.tap(50, 200);
		assert.equal(
			await page.evaluate(() => reading.view.scrollDOM.scrollTop),
			0,
		);
		await page.evaluate(() => reading.setPaging(false, 0));
		await page.touchscreen.tap(360, 200);
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
