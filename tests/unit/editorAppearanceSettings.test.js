// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	value: {},
	update: vi.fn(),
	pages: [],
	uiSettings: {},
}));
vi.mock("lib/settings", () => ({ default: mocks }));
vi.mock("lib/fonts", () => ({ default: { getNames: () => [], setFont: vi.fn() } }));
vi.mock("lib/config", () => ({ default: { FONT_SIZE: /px$/ } }));
vi.mock("../../src/settings/scrollSettings", () => ({ default: vi.fn() }));
vi.mock("components/settingsPage", () => ({ default: (title, items, callback) => {
	const page = { items, callback, show: vi.fn(), hide: vi.fn() };
	mocks.pages.push(page);
	return page;
} }));
import editorSettings from "../../src/settings/editorSettings";

beforeEach(() => {
	vi.stubGlobal("strings", new Proxy({}, { get: (_, key) => String(key) }));
	mocks.value = { editorTheme: "one_dark", lineHeight: 2, editorPaddingLeft: null, editorPaddingRight: null, editorParagraphSpacing: 0 };
	mocks.pages.length = 0;
	mocks.uiSettings = {};
	mocks.update.mockReset().mockImplementation((values) => Object.assign(mocks.value, values));
});

describe("editor appearance settings", () => {
	it("exposes color pickers, spacing inputs, and line heights greater than two", () => {
		const page = editorSettings();
		for (const key of ["editorBackgroundColor", "editorForegroundColor"]) expect(page.items.find(item => item.key === key).color).toBe(true);
		expect(page.items.find(item => item.key === "lineHeight").promptOptions.test("3.5")).toBe(true);
		page.callback("editorPaddingLeft", "12.5");
		expect(mocks.update).toHaveBeenCalledWith({ editorPaddingLeft: 12.5 });
		page.callback("editorParagraphSpacing", -1);
		expect(mocks.update).toHaveBeenCalledTimes(1);
	});
	it("restores theme defaults and rebuilds the settings page without changing fonts", () => {
		mocks.value.fontSize = "18px";
		const page = editorSettings();
		mocks.uiSettings["editor-settings"] = page;
		page.callback("resetEditorAppearance");
		expect(mocks.value.editorBackgroundColor).toBeNull();
		expect(mocks.value.editorForegroundColor).toBeNull();
		expect(mocks.value.lineHeight).toBe(2);
		expect(mocks.value.fontSize).toBe("18px");
		expect(page.hide).toHaveBeenCalledOnce();
		expect(mocks.uiSettings["editor-settings"]).toBe(mocks.pages[1]);
		expect(mocks.pages[1].show).toHaveBeenCalledOnce();
	});
});
