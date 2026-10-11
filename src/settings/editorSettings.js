import {
	editorAppearanceKeys,
	isValidEditorSpacing,
} from "cm/editorAppearance";
import { isValidEditorLineHeight } from "cm/editorFontTheme";
import { isValidPageSwipeDistance } from "cm/editorPageTurning";
import { getThemeConfig } from "cm/themes";
import settingsPage from "components/settingsPage";
import config from "lib/config";
import fonts from "lib/fonts";
import appSettings from "lib/settings";
import scrollSettings from "./scrollSettings";

export default function editorSettings() {
	const title = strings["editor settings"];
	const values = appSettings.value;
	const wrappingIndentOptions = [
		["none", strings.none],
		["same", strings["wrap-indent-same"]],
		["indent", strings["wrap-indent-indent"]],
		["deepIndent", strings["wrap-indent-deep"]],
	];
	const categories = {
		scrolling: strings["settings-category-scrolling"],
		textLayout: strings["settings-category-text-layout"],
		editing: strings["settings-category-editing"],
		assistance: strings["settings-category-assistance"],
		guidesIndicators: strings["settings-category-guides-indicators"],
		cursorSelection: strings["settings-category-cursor-selection"],
	};
	const theme = getThemeConfig(values.editorTheme);
	const appearanceLabel = (key, fallback) => strings[key] || fallback;
	const spacingItem = (key, label, description) => ({
		key,
		text: label,
		value: values[key],
		valueText: (value) =>
			value == null
				? appearanceLabel("editor-appearance-default", "Default")
				: `${value}px`,
		prompt: `${label} (0–80px)`,
		promptType: "number",
		promptOptions: { test: isValidEditorSpacing },
		info: description,
		category: categories.textLayout,
	});
	const items = [
		{
			key: "editorBackgroundColor",
			text: appearanceLabel(
				"editor-appearance-background",
				"Editor background color",
			),
			value: values.editorBackgroundColor || theme.background,
			color: true,
			category: categories.textLayout,
		},
		{
			key: "editorForegroundColor",
			text: appearanceLabel(
				"editor-appearance-foreground",
				"Default text color",
			),
			value: values.editorForegroundColor || theme.foreground,
			color: true,
			info: appearanceLabel(
				"editor-appearance-foreground-info",
				"Changes plain text; preserves syntax highlighting.",
			),
			category: categories.textLayout,
		},
		spacingItem(
			"editorParagraphSpacing",
			appearanceLabel("editor-appearance-paragraph", "Paragraph spacing"),
			appearanceLabel(
				"editor-appearance-paragraph-info",
				"Adds spacing between paragraphs separated by manual line breaks. Soft-wrapped rows are unaffected; file contents are unchanged.",
			),
		),
		spacingItem(
			"editorPaddingLeft",
			appearanceLabel("editor-appearance-left", "Left text padding"),
		),
		spacingItem(
			"editorPaddingRight",
			appearanceLabel("editor-appearance-right", "Right text padding"),
		),
		spacingItem(
			"editorPaddingTop",
			appearanceLabel("editor-appearance-top", "Top text padding"),
		),
		spacingItem(
			"editorPaddingBottom",
			appearanceLabel("editor-appearance-bottom", "Bottom text padding"),
		),

		{
			key: "resetEditorAppearance",
			text: appearanceLabel(
				"editor-appearance-reset",
				"Restore default appearance",
			),
			info: appearanceLabel(
				"editor-appearance-reset-info",
				"Follow theme colors and restore paragraph spacing and text padding. Font size and line height are preserved.",
			),
			category: categories.textLayout,
		},
		{
			key: "editorPageTurning",
			text: appearanceLabel("editor-page-turning", "Page turning"),
			checkbox: values.editorPageTurning,
			info: appearanceLabel(
				"editor-page-turning-info",
				"Only active in read-only mode. Swipe right on the left half for the previous page; swipe left on the right half for the next page. Editing keeps normal taps and vertical scrolling.",
			),
			category: categories.scrolling,
		},
		{
			key: "editorPageSwipeDistance",
			text: appearanceLabel(
				"editor-page-swipe-distance",
				"Page swipe distance",
			),
			value: values.editorPageSwipeDistance ?? 60,
			valueText: (value) => `${value}px`,
			prompt: `${appearanceLabel("editor-page-swipe-distance", "Page swipe distance")} (px ≥ 0)`,
			promptType: "number",
			promptOptions: { test: isValidPageSwipeDistance },
			info: appearanceLabel(
				"editor-page-swipe-distance-info",
				"Minimum horizontal swipe distance in px. Set 0 to tap the left/right half for previous/next page.",
			),
			category: categories.scrolling,
		},
		{
			key: "editorPageLockVerticalScroll",
			text: appearanceLabel(
				"editor-page-lock-vertical",
				"Disable vertical scrolling during horizontal paging",
			),
			checkbox: values.editorPageLockVerticalScroll,
			category: categories.scrolling,
		},

		{
			key: "scroll-settings",
			text: strings["scroll settings"],
			info: strings["settings-info-editor-scroll-settings"],
			category: categories.scrolling,
			chevron: true,
		},
		{
			key: "editorFont",
			text: strings["editor font"],
			value: values.editorFont,
			get select() {
				return fonts.getNames();
			},
			info: strings["settings-info-editor-font-family"],
			category: categories.textLayout,
		},
		{
			key: "fontSize",
			text: strings["font size"],
			value: values.fontSize,
			prompt: strings["font size"],
			promptOptions: {
				required: true,
				match: config.FONT_SIZE,
			},
			info: strings["settings-info-editor-font-size"],
			category: categories.textLayout,
		},
		{
			key: "lineHeight",
			text: strings["line height"],
			value: values.lineHeight,
			prompt: `${strings["line height"]} (1–4)`,
			promptType: "number",
			promptOptions: {
				test: isValidEditorLineHeight,
			},
			info: strings["settings-info-editor-line-height"],
			category: categories.textLayout,
		},
		{
			key: "textWrap",
			text: strings["text wrap"],
			checkbox: values.textWrap,
			info: strings["settings-info-editor-text-wrap"],
			category: categories.textLayout,
		},
		{
			key: "wrappingIndent",
			text: strings["wrapped line indent"],
			value: values.wrappingIndent ?? "same",
			valueText: (value) =>
				wrappingIndentOptions.find(([key]) => key === value)?.[1] ??
				wrappingIndentOptions[1][1],
			select: wrappingIndentOptions,
			info: strings["settings-info-editor-wrapping-indent"],
			category: categories.textLayout,
		},
		{
			key: "autosave",
			text: strings.autosave,
			value: values.autosave,
			valueText: (value) => (value ? value : strings.no),
			prompt: strings.delay + " (>=1000 || 0)",
			promptType: "number",
			promptOptions: {
				test(value) {
					value = Number.parseInt(value);
					return value >= 1000 || value === 0;
				},
			},
			info: strings["settings-info-editor-autosave"],
			category: categories.editing,
		},
		{
			key: "softTab",
			text: strings["soft tab"],
			checkbox: values.softTab,
			info: strings["settings-info-editor-soft-tab"],
			category: categories.editing,
		},
		{
			key: "tabSize",
			text: strings["tab size"],
			value: values.tabSize,
			prompt: strings["tab size"],
			promptType: "number",
			promptOptions: {
				test(value) {
					value = Number.parseInt(value);
					return value >= 1 && value <= 8;
				},
			},
			info: strings["settings-info-editor-tab-size"],
			category: categories.editing,
		},
		{
			key: "formatOnSave",
			text: strings["format on save"],
			checkbox: values.formatOnSave,
			info: strings["settings-info-editor-format-on-save"],
			category: categories.editing,
		},
		{
			key: "liveAutoCompletion",
			text: strings["live autocompletion"],
			checkbox: values.liveAutoCompletion,
			info: strings["settings-info-editor-live-autocomplete"],
			category: categories.assistance,
		},
		{
			key: "localWordCompletion",
			text: strings["local word completion"],
			checkbox: values.localWordCompletion,
			info: strings["settings-info-editor-local-word-completion"],
			category: categories.assistance,
		},
		{
			key: "languageCompletion",
			text: strings["language package completion"],
			checkbox: values.languageCompletion ?? true,
			info: strings["settings-info-editor-language-completion"],
			category: categories.assistance,
		},
		{
			key: "recommendExtensions",
			text: strings["recommend extensions"],
			checkbox: values.recommendExtensions ?? true,
			info: strings["settings-info-editor-recommend-extensions"],
			category: categories.assistance,
		},
		{
			key: "useEmmet",
			text: strings["use emmet"],
			checkbox: values.useEmmet ?? true,
			category: categories.assistance,
		},
		{
			key: "autoCloseTags",
			text: strings["auto close tags"],
			checkbox: values.autoCloseTags,
			info: strings["settings-info-editor-auto-close-tags"],
			category: categories.assistance,
		},
		{
			key: "autoRenameTags",
			text: strings["auto rename tags"],
			checkbox: values.autoRenameTags ?? true,
			info: strings["settings-info-editor-auto-rename-tags"],
			category: categories.assistance,
		},
		{
			key: "colorPreview",
			text: strings["color preview"],
			checkbox: values.colorPreview,
			info: strings["settings-info-editor-color-preview"],
			category: categories.assistance,
		},
		{
			key: "linenumbers",
			text: strings["show line numbers"],
			checkbox: values.linenumbers,
			info: strings["settings-info-editor-line-numbers"],
			category: categories.guidesIndicators,
		},
		{
			key: "relativeLineNumbers",
			text: strings["relative line numbers"],
			checkbox: values.relativeLineNumbers,
			info: strings["settings-info-editor-relative-line-numbers"],
			category: categories.guidesIndicators,
		},
		{
			key: "lintGutter",
			text: strings["lint gutter"] || "Show lint gutter",
			checkbox: values.lintGutter ?? true,
			info: strings["settings-info-editor-lint-gutter"],
			category: categories.guidesIndicators,
		},
		{
			key: "showSpaces",
			text: strings["show spaces"],
			checkbox: values.showSpaces,
			info: strings["settings-info-editor-show-spaces"],
			category: categories.guidesIndicators,
		},
		{
			key: "indentGuides",
			text: strings["indent guides"] || "Indent guides",
			checkbox: values.indentGuides ?? false,
			info: strings["settings-info-editor-indent-guides"],
			category: categories.guidesIndicators,
		},
		{
			key: "rainbowBrackets",
			text: strings["rainbow brackets"] || "Rainbow brackets",
			checkbox: values.rainbowBrackets ?? true,
			info: strings["settings-info-editor-rainbow-brackets"],
			category: categories.guidesIndicators,
		},
		{
			key: "fadeFoldWidgets",
			text: strings["fade fold widgets"],
			checkbox: values.fadeFoldWidgets,
			info: strings["settings-info-editor-fade-fold-widgets"],
			category: categories.guidesIndicators,
		},
		{
			key: "editorActiveLineColor",
			text: appearanceLabel(
				"editor-active-line-color",
				"Clicked paragraph highlight color",
			),
			value: values.editorActiveLineColor || theme.activeLine || "#80808033",
			color: true,
			category: categories.cursorSelection,
		},

		{
			key: "editorSelectionColor",
			text: appearanceLabel(
				"editor-selection-color",
				"Selected text highlight color",
			),
			value: values.editorSelectionColor || theme.selection || "#264f78",
			color: true,
			category: categories.cursorSelection,
		},
		{
			key: "editorCursorColor",
			text: appearanceLabel("editor-cursor-color", "Cursor settings"),
			value: values.editorCursorColor || theme.cursor || theme.foreground,
			color: true,
			category: categories.cursorSelection,
		},
		{
			key: "cursorWidth",
			text: appearanceLabel("editor-cursor-width", "Cursor width"),
			value: values.cursorWidth,
			valueText: (value) => `${value}px`,
			prompt: `${appearanceLabel("editor-cursor-width", "Cursor width")} (0 < px ≤ 10)`,
			promptType: "number",
			promptOptions: {
				test: (value) =>
					String(value).trim() !== "" &&
					Number.isFinite(Number(value)) &&
					Number(value) > 0 &&
					Number(value) <= 10,
			},
			category: categories.cursorSelection,
		},

		{
			key: "showShareButton",
			text: strings["show share button"],
			checkbox: values.showShareButton ?? true,
			info: strings["settings-info-editor-show-share-button"],
			category: categories.cursorSelection,
		},
		{
			key: "shiftClickSelection",
			text: strings["shift click selection"],
			checkbox: values.shiftClickSelection !== false,
			info: strings["settings-info-editor-shift-click-selection"],
			category: categories.cursorSelection,
		},
		{
			key: "rtlText",
			text: strings["line based rtl switching"],
			checkbox: values.rtlText,
			info: strings["settings-info-editor-rtl-text"],
			category: categories.cursorSelection,
		},
	];

	return settingsPage(title, items, callback, undefined, {
		preserveOrder: true,
		pageClassName: "detail-settings-page",
		listClassName: "detail-settings-list",
		infoAsDescription: true,
		valueInTail: true,
	});

	/**
	 * Callback for settings page when an item is clicked
	 * @param {string} key
	 * @param {string} value
	 */
	function callback(key, value) {
		if (key === "cursorWidth") {
			if (
				String(value).trim() !== "" &&
				Number.isFinite(Number(value)) &&
				Number(value) > 0 &&
				Number(value) <= 10
			)
				appSettings.update({ cursorWidth: Number(value) });
			return;
		}
		if (key === "editorPageSwipeDistance") {
			if (isValidPageSwipeDistance(value))
				appSettings.update({ [key]: Number(value) });
			return;
		}
		if (key === "resetEditorAppearance") {
			appSettings.update({
				editorBackgroundColor: null,
				editorForegroundColor: null,
				editorSelectionColor: null,
				editorActiveLineColor: null,
				editorCursorColor: null,
				cursorWidth: 2,
				editorPaddingTop: 30,
				editorPaddingBottom: 0,
				editorParagraphSpacing: 0,
				editorPaddingLeft: null,
				editorPaddingRight: null,
			});
			// Refresh displayed values after resetting, too.
			const page = appSettings.uiSettings["editor-settings"];
			if (page) page.hide();
			const nextPage = editorSettings();
			appSettings.uiSettings["editor-settings"] = nextPage;
			nextPage.show();
			return;
		}
		if (editorAppearanceKeys.includes(key) && !key.endsWith("Color")) {
			if (isValidEditorSpacing(value))
				appSettings.update({ [key]: Number(value) });
			return;
		}
		if (key === "lineHeight") {
			if (!isValidEditorLineHeight(value)) return;
			appSettings.update({ lineHeight: Number(value) });
			return;
		}
		switch (key) {
			case "scroll-settings":
				appSettings.uiSettings[key].show();
				return;

			case "editorFont":
				fonts.setFont(value);

			default:
				appSettings.update({
					[key]: value,
				});
				break;
		}
	}
}
