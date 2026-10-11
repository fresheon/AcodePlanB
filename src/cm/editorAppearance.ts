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
    let blank = false;
    for (let n = 1; n <= doc.lines; n++) {
      const line = doc.line(n);
      if (!line.text.trim()) {
        blank = true;
        continue;
      }
      if (previousParagraph && blank) ranges.push(mark.range(line.from));
      previousParagraph = true;
      blank = false;
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
  const root: Record<string, string> = {};
  // CodeMirror content has zero horizontal padding by default. Set it
  // explicitly so resetting also removes a previous user override.
  const content: Record<string, string> = {
    paddingLeft: "0px",
    paddingRight: "0px",
  };
  if (background) root.backgroundColor = background;
  if (foreground) root.color = content.color = foreground;
  for (const [key, property] of [
    ["editorPaddingLeft", "paddingLeft"],
    ["editorPaddingRight", "paddingRight"],
  ] as const) {
    if (values[key] != null && isValidEditorSpacing(values[key])) {
      content[property] = `${Number(values[key])}px`;
    }
  }
  return [
    Prec.high(EditorView.theme({ "&": root, ".cm-content": content })),
    paragraphSpacing(values.editorParagraphSpacing),
  ];
}
