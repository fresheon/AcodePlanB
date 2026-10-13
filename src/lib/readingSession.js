const key = "acode-reading-positions-v1";
function positions(storage) {
  try { return JSON.parse(storage.getItem(key) || "{}") || {}; } catch { return {}; }
}
export function validReadingPosition(position) {
  return position && Number.isSafeInteger(position.from) && position.from >= 0 &&
    Number.isFinite(position.offset) && Number.isFinite(position.left);
}
export function captureReadingPosition(view) {
  try {
  if (!view?.state?.doc || !view.scrollDOM?.isConnected) return null;
  const box = view.scrollDOM.getBoundingClientRect();
  if (!box.height || !box.width) return null;
  const content = view.contentDOM.getBoundingClientRect();
  const x = Math.max(box.left + 1, Math.min(box.right - 1, content.left + 1));
  // A hit test at the clipped top edge can pick the adjacent wrapped row.
  // Anchor the actual rendered line and retain its (possibly negative) offset.
  const firstLine = [...view.contentDOM.querySelectorAll(".cm-line")].find(line => {
    const rect = line.getBoundingClientRect();
    return rect.bottom > box.top && rect.top < box.bottom;
  });
  const from = firstLine ? view.posAtDOM(firstLine, 0) :
    (view.posAtCoords({ x, y: box.top + 1 }, false) ??
      view.lineBlockAtHeight(Math.max(0, box.top - view.documentTop)).from);
  const rect = view.coordsAtPos(from);
  if (!rect) return null;
  return { from, offset: rect.top - box.top, left: view.scrollDOM.scrollLeft };
  } catch {
    // During a CodeMirror update, preserve the last measured anchor.
    return null;
  }
}
export function savedReadingPosition(file, storage = localStorage) {
  const saved = positions(storage)[file.id];
  if (saved?.uri === (file.uri || null) && validReadingPosition(saved.position)) return saved.position;
  return validReadingPosition(file.readingPosition) ? file.readingPosition : null;
}
export function persistReadingPosition(file, view, storage = localStorage) {
  if (!file || file.type !== "editor" || !file.loaded || file.loading || file.__readingRestorePending) return;
  const position = captureReadingPosition(view);
  if (!position) return;
  file.readingPosition = position;
  file.lastScrollTop = view.scrollDOM.scrollTop;
  file.lastScrollLeft = view.scrollDOM.scrollLeft;
  const saved = positions(storage);
  saved[file.id] = { uri: file.uri || null, position };
  storage.setItem(key, JSON.stringify(saved));
  // Update synchronously: a killed process has no reliable shutdown callback.
  const files = JSON.parse(storage.getItem("files") || "[]");
  const entry = files.find(item => item.id === file.id);
  if (entry) {
    Object.assign(entry, { readingPosition: position, scrollTop: file.lastScrollTop, scrollLeft: file.lastScrollLeft, editable: false });
    storage.setItem("files", JSON.stringify(files));
  }
}
export function forgetReadingPosition(file, storage = localStorage) {
  const saved = positions(storage);
  delete saved[file.id];
  storage.setItem(key, JSON.stringify(saved));
  file.readingPosition = null;
}
export function restoreReadingPosition(view, file, isCurrent, done = () => {}) {
  const position = file.readingPosition;
  if (!validReadingPosition(position)) return null;
  let cancelled = false, passes = 0, frame = 0;
  const from = Math.min(position.from, view.state.doc.length);
  file.__readingRestorePending = true;
  const finish = () => { file.__readingRestorePending = false; done(); };
  // Do not leave a scrollIntoView target that can later reapply its default
  // margin and move the restored page. Scroll to the text block, then measure.
  const top = view.lineBlockAt(from).top + view.documentTop - view.scrollDOM.getBoundingClientRect().top;
  view.scrollDOM.scrollTop = Math.max(0, view.scrollDOM.scrollTop + top - position.offset);
  const measure = () => view.requestMeasure({
    read() {
      if (cancelled || !isCurrent()) return null;
      const rect = view.coordsAtPos(from);
      return rect ? rect.top - view.scrollDOM.getBoundingClientRect().top - position.offset : null;
    },
    write(delta) {
      if (cancelled || !isCurrent()) { finish(); return; }
      if (delta !== null) {
        view.scrollDOM.scrollTop += delta;
        view.scrollDOM.scrollLeft = position.left;
      }
      if (++passes < 8 && (delta === null || Math.abs(delta) > 0.5 || passes < 3)) frame = requestAnimationFrame(measure);
      else finish();
    },
  });
  measure();
  return () => { cancelled = true; cancelAnimationFrame(frame); file.__readingRestorePending = false; };
}
