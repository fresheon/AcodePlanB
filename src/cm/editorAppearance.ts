import { Prec, RangeSetBuilder, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterLineClass,
  type DecorationSet,
} from "@codemirror/view";

export const editorAppearanceKeys = [
  "editorBackgroundColor",
  "editorForegroundColor",
  "editorSelectionColor",
  "editorActiveLineColor",
  "editorCursorColor",
  "editorPaddingTop",
  "editorPaddingBottom",
  "editorParagraphSpacing",
  "editorPaddingLeft",
  "editorPaddingRight",
] as const;

type AppearanceSettings = Partial<
  Record<(typeof editorAppearanceKeys)[number], unknown>
>;

export function isValidEditorSpacing(value: unknown): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !value.trim()) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 80;
}

function color(value: unknown): string | undefined {
  return typeof value === "string" && CSS.supports("color", value)
    ? value
    : undefined;
}

function paragraphSpacing(value: unknown) {
  const spacing = isValidEditorSpacing(value) ? Number(value) : 0;
  if (!spacing) return [];
  const mark = Decoration.line({
    attributes: { style: `padding-top: ${spacing}px` },
  });
  function build(doc: import("@codemirror/state").Text): DecorationSet {
    const ranges = [];
    let previousParagraph = false;
    for (let n = 1; n <= doc.lines; n++) {
      const line = doc.line(n);
      // Hard line breaks separate paragraphs. Soft-wrapped rows belong to the
      // same document line, so they receive no additional paragraph spacing.
      // Preserve blank lines and apply the extra gap once to each next paragraph.
      if (!line.text.trim()) continue;
      if (previousParagraph) ranges.push(mark.range(line.from));
      previousParagraph = true;
    }
    return Decoration.set(ranges);
  }
  class ParagraphMarker extends GutterMarker {
    elementClass = "cm-paragraph-gap";
  }
  const marker = new ParagraphMarker();
  return [
    EditorView.theme({
      ".cm-gutterElement.cm-paragraph-gap": {
        paddingTop: `${spacing}px`,
        boxSizing: "border-box",
      },
    }),
    StateField.define<DecorationSet>({
      create: (state) => build(state.doc),
      update: (decorations, transaction) =>
        transaction.docChanged ? build(transaction.newDoc) : decorations,
      provide: (field) => [
        EditorView.decorations.from(field),
        gutterLineClass.compute([field], (state) => {
          const builder = new RangeSetBuilder<GutterMarker>();
          const cursor = state.field(field).iter();
          while (cursor.value) {
            builder.add(cursor.from, cursor.from, marker);
            cursor.next();
          }
          return builder.finish();
        }),
      ],
    }),
  ];
}

export function editorAppearance(values: AppearanceSettings) {
  const background = color(values.editorBackgroundColor);
  const foreground = color(values.editorForegroundColor);
  const root: Record<string, string> = {
    "--editor-padding-top": `${isValidEditorSpacing(values.editorPaddingTop) ? Number(values.editorPaddingTop) : 30}px`,
    "--editor-padding-bottom": `${isValidEditorSpacing(values.editorPaddingBottom) ? Number(values.editorPaddingBottom) : 0}px`,
    "--editor-content-bottom": `${isValidEditorSpacing(values.editorPaddingBottom) ? Number(values.editorPaddingBottom) : 0}px`,
  };
  // CodeMirror content has zero horizontal padding by default. Set it
  // explicitly so resetting also removes a previous user override.
  const content: Record<string, string> = {
    paddingLeft: "0px",
    paddingRight: "0px",
    paddingBottom:
      "calc(var(--editor-content-bottom) + var(--cm-page-tail, 0px))",
  };
  if (background) root.backgroundColor = background;
  if (foreground) root.color = content.color = foreground;
  for (const [key, property] of [
    ["editorPaddingLeft", "paddingLeft"],
    ["editorPaddingRight", "paddingRight"],
    ["editorPaddingTop", "paddingTop"],
  ] as const) {
    if (values[key] != null && isValidEditorSpacing(values[key])) {
      content[property] = `${Number(values[key])}px`;
    }
  }
  const theme: Record<string, Record<string, string>> = {
    "&": root,
    ".cm-content": content,
    ".editor-content-fullscreen &": { "--editor-content-bottom": "0px" },
    ".editor-content-fullscreen & .cm-content": { paddingTop: "0px" },
  };
  const selection = color(values.editorSelectionColor);
  const cursor = color(values.editorCursorColor);
  const activeLine = color(values.editorActiveLineColor);
  if (activeLine) {
    theme["&:not(.cm-read-only) .cm-activeLine"] = { backgroundColor: activeLine };
  }
  if (selection) {
    theme[
      "&:not(.cm-read-only).cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, &:not(.cm-read-only) .cm-selectionBackground, &:not(.cm-read-only) .cm-content::selection, &:not(.cm-read-only) .cm-content ::selection"
    ] = { backgroundColor: `${selection} !important` };
  }
  if (cursor) {
    theme["&:not(.cm-read-only) .cm-content"] = { caretColor: cursor };
    theme[
      "&:not(.cm-read-only) .cm-cursor, &:not(.cm-read-only) .cm-dropCursor"
    ] = { borderLeftColor: cursor };
  }
  return [
    Prec.high(EditorView.theme(theme)),
    paragraphSpacing(values.editorParagraphSpacing),
  ];
}
