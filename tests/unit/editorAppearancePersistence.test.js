// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { loadSourceModule } from "../helpers/loadSourceModule";

// Recreate the actual settings singleton on each launch; only Cordova I/O is replaced.
function storage(initial = {}) {
	let contents = JSON.stringify(initial);
	const write = vi.fn(async (text) => {
		contents = text;
	});
	const fileSystem = () => ({
		exists: async () => true,
		readFile: async () => contents,
		writeFile: write,
	});
	class ThemeBuilder {
		toJSON() {
			return {};
		}
		static fromJSON(value) {
			return value;
		}
	}
	async function launch() {
		const { default: settings } = loadSourceModule(
			"src/lib/settings.js",
			{
				fileSystem,
				"theme/builder": ThemeBuilder,
				"theme/list": { update: vi.fn() },
				"theme/preInstalled": { getSystemEditorTheme: () => "one_dark" },
				"utils/helpers": { parseJSON: JSON.parse },
				"utils/Url": { join: (base, name) => base + name },
				"./config": {},
				"./lang": {},
				"./systemConfiguration": { isDeviceDarkTheme: () => false },
			},
			{
				structuredClone,
				devicePixelRatio: 1,
				CSS,
				navigator,
				DATA_STORAGE: "file:///data/",
				toast: vi.fn(),
				strings: {},
			},
		);
		await settings.init();
		return settings;
	}
	return { launch, write, saved: () => JSON.parse(contents) };
}
const overrides = {
	editorBackgroundColor: "#182736",
	editorForegroundColor: "#e6d5c4",
	editorPaddingLeft: 12.5,
	editorPaddingRight: 24,
};
describe("editor appearance persistence", () => {
	it("retains all four overrides across save, fresh launch, unrelated update and another launch", async () => {
		const disk = storage();
		const first = await disk.launch();
		await first.update(overrides);
		expect(disk.saved()).toMatchObject(overrides);
		const second = await disk.launch();
		expect(second).not.toBe(first);
		expect(second.value).toMatchObject(overrides);
		await second.update({ editorTheme: "light", editorPageTurning: true });
		expect((await disk.launch()).value).toMatchObject(overrides);
	});
	it("preserves numeric paragraph spacing across launches and permits disabling it", async () => {
		const disk = storage();
		let settings = await disk.launch();
		for (const spacing of [18, 40, 80, 0]) {
			await settings.update({ editorParagraphSpacing: spacing });
			settings = await disk.launch();
			expect(settings.value.editorParagraphSpacing).toBe(spacing);
		}
	});
	it("retains explicit zero padding and permits restoring theme/default values", async () => {
		const disk = storage(overrides);
		const settings = await disk.launch();
		await settings.update({ editorPaddingLeft: 0, editorPaddingRight: 80 });
		expect((await disk.launch()).value).toMatchObject({
			editorPaddingLeft: 0,
			editorPaddingRight: 80,
		});
		const defaults = Object.fromEntries(
			Object.keys(overrides).map((key) => [key, null]),
		);
		await settings.update(defaults);
		expect((await disk.launch()).value).toMatchObject(defaults);
	});
	it("uses defaults for missing and invalid values without relaxing other settings' type checks", async () => {
		const disk = storage({
			editorBackgroundColor: 123,
			editorForegroundColor: false,
			editorPaddingLeft: -1,
			editorPaddingRight: "20",
			editorPageTurning: "true",
		});
		expect((await disk.launch()).value).toMatchObject({
			editorBackgroundColor: null,
			editorForegroundColor: null,
			editorPaddingLeft: null,
			editorPaddingRight: null,
			editorPageTurning: false,
		});
		expect((await storage().launch()).value).toMatchObject({
			editorBackgroundColor: null,
			editorForegroundColor: null,
			editorPaddingLeft: null,
			editorPaddingRight: null,
		});
	});
});
