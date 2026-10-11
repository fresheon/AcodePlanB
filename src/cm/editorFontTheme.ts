import { EditorView } from "@codemirror/view";

export function isValidEditorLineHeight(value: unknown): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  const height = Number(value);
  return Number.isFinite(height) && height >= 1 && height <= 4;
}

export function editorFontTheme(
  fontSize: string,
  fontFamily: string,
  lineHeight: unknown,
) {
  const height = isValidEditorLineHeight(lineHeight) ? Number(lineHeight) : 2;
  return EditorView.theme({
    "&": { fontSize },
    // CodeMirror's base theme sets line-height on the scroller, so setting
    // it on the editor root alone cannot change the content or gutter height.
    ".cm-scroller": { lineHeight: String(height) },
    ".cm-content": { fontFamily },
    ".cm-gutter": { fontFamily },
    ".cm-tooltip, .cm-tooltip *": { fontFamily },
  });
}
