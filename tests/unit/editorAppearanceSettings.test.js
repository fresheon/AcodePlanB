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
vi.mock("components/settingsPage", () => ({ default: (title, items, callback) => {
	const page = { items, callback, show: vi.fn(), hide: vi.fn() };
	mocks.pages.push(page);
	return page;
} }));
import { editorProfileKeys } from "lib/editorProfiles";
import editorSettings from "../../src/settings/editorSettings";
import scrollSettings from "../../src/settings/scrollSettings";

beforeEach(() => {
	vi.stubGlobal("strings", new Proxy({}, { get: (_, key) => String(key) }));
	mocks.value = { editorTheme: "one_dark", lineHeight: 2, editorPaddingLeft: null, editorPaddingRight: null, editorParagraphSpacing: 0 };
	mocks.pages.length = 0;
	mocks.uiSettings = {};
	mocks.update.mockReset().mockImplementation((values) => Object.assign(mocks.value, values));
});

describe("editor appearance settings", () => {
	it("distinguishes font presentation and includes all four profile categories including scrolling subpage", () => {
		const page = editorSettings();
		const font = page.items.find(item => item.key === "editorFont").category;
		const layout = page.items.find(item => item.key === "editorBackgroundColor").category;
		const cursor = page.items.find(item => item.key === "cursorWidth").category;
		expect(font).toBe("settings-category-font-presentation");
		expect(font).not.toBe(layout);
		const scrolling = page.items.find(item => item.key === "editorPageTurning").category;
		const keys = page.items.filter(item => [font, layout, cursor, scrolling].includes(item.category) && !["resetEditorAppearance", "scroll-settings"].includes(item.key)).map(item => item.key);
		keys.push(...scrollSettings().items.map(item => item.key));
		expect(keys.sort()).toEqual([...editorProfileKeys].sort());
	});

	it("accepts a numeric font size and stores the fixed px unit", () => {
		mocks.value.fontSize = "18px";
		const page = editorSettings();
		const item = page.items.find((item) => item.key === "fontSize");
		expect(item.value).toBe(18);
		expect(item.promptType).toBe("number");
		expect(item.valueText(18)).toBe("18px");
		for (const value of ["20", "22.5"]) expect(item.promptOptions.test(value)).toBe(true);
		for (const value of ["20px", "", "0", "-1", "Infinity"]) expect(item.promptOptions.test(value)).toBe(false);
		page.callback("fontSize", "22.5");
		expect(mocks.update).toHaveBeenCalledWith({ fontSize: "22.5px" });
	});
	it("exposes color pickers, spacing inputs, and line heights greater than two", () => {
		const page = editorSettings();
		for (const key of ["editorBackgroundColor", "editorForegroundColor", "editorSelectionColor", "editorCursorColor", "editorActiveLineColor"]) expect(page.items.find(item => item.key === key).color).toBe(true);
		expect(page.items.find(item => item.key === "lineHeight").promptOptions.test("3.5")).toBe(true);
		page.callback("editorPaddingLeft", "12.5");
		expect(mocks.update).toHaveBeenCalledWith({ editorPaddingLeft: 12.5 });
		page.callback("editorParagraphSpacing", -1);
		expect(mocks.update).toHaveBeenCalledTimes(1);
	});
	it("groups page controls above scroll settings and validates cursor width", () => {
		const page = editorSettings();
		const index = page.items.findIndex(item => item.key === "scroll-settings");
		expect(page.items.slice(index - 3, index).map(item => item.key)).toEqual(["editorPageTurning", "editorPageSwipeDistance", "editorPageLockVerticalScroll"]);
		expect(page.items[index - 2].category).toBe(page.items[index].category);
		page.callback("cursorWidth", "3.5");
		expect(mocks.value.cursorWidth).toBe(3.5);
		for (const invalid of ["", 0, -1, 11, Infinity]) page.callback("cursorWidth", invalid);
		expect(mocks.update).toHaveBeenCalledTimes(1);
		page.callback("editorPaddingTop", "22");
		page.callback("editorPaddingBottom", "18");
		expect(mocks.value.editorPaddingTop).toBe(22);
		expect(mocks.value.editorPaddingBottom).toBe(18);
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
