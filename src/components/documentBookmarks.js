import { EditorView } from "@codemirror/view";

export function bookmarkExcerpt(text, position) {
  const before = Array.from(text.slice(0, position));
  const after = Array.from(text.slice(position));
  const leading = before.slice(-15);
  const trailing = after.slice(0, 30 - leading.length);
  return [...before.slice(-(30 - trailing.length)), ...trailing].join("").replace(/\s+/g, " ").trim();
}

export function bookmarkScrollPosition(view) {
  if (!view.scrollDOM) return 0;
  const bounds = view.scrollDOM.getBoundingClientRect();
  const textBounds = view.contentDOM?.getBoundingClientRect();
  const x = Math.max(bounds.left + 1, (textBounds?.left ?? bounds.left) + 1);
  const position = view.posAtCoords?.({ x, y: bounds.top + 1 });
  if (position != null) return Math.max(0, Math.min(view.state.doc.length, position));
  return view.lineBlockAtHeight(Math.max(0, bounds.top - view.documentTop)).from;
}

export function createBookmarkStore(storage) {
  const storageKey = (documentKey) => `acode-document-bookmarks-v1:${encodeURIComponent(documentKey)}`;
  const sort = (items) => items.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  function list(key) {
    const raw = storage.getItem(storageKey(key));
    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.some((item) => !item || typeof item.id !== "string" || !Number.isSafeInteger(item.position) || item.position < 0 || !Number.isFinite(item.createdAt) || typeof item.text !== "string")) {
      throw new Error("Invalid saved bookmarks");
    }
    return sort(items);
  }
  const write = (key, items) => storage.setItem(storageKey(key), JSON.stringify(sort(items)));
  return {
    list,
    add(key, text, position) {
      position = Math.max(0, Math.min(text.length, position));
      const item = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        position,
        text: bookmarkExcerpt(text, position),
        createdAt: Date.now(),
      };
      write(key, [...list(key), item]);
      return item;
    },
    edit(key, id, text) {
      if (Array.from(text).length > 50) throw new Error("Bookmark text exceeds 50 characters");
      write(key, list(key).map((item) => item.id === id ? { ...item, text } : item));
    },
    remove(key, ids) { write(key, list(key).filter((item) => !ids.has(item.id))); },
    map(key, changes) {
      const items = list(key);
      if (items.length) write(key, items.map((item) => ({ ...item, position: changes.mapPos(Math.min(item.position, changes.length), 1) })));
    },
    move(previous, next) {
      if (previous === next) return;
      const existing = list(next);
      const ids = new Set(existing.map((item) => item.id));
      write(next, [...existing, ...list(previous).filter((item) => !ids.has(item.id))]);
      storage.removeItem(storageKey(previous));
    },
  };
}

export default function documentBookmarks({ manager, labels, storage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
} }) {
  const store = createBookmarkStore(storage);
  const text = (key, fallback) => labels[key] || fallback;
  const overlay = document.createElement("div");
  overlay.className = "editor-bookmark-overlay";
  overlay.hidden = true;
  const panel = document.createElement("aside");
  panel.className = "editor-bookmark-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", text("bookmarks", "书签"));
  panel.tabIndex = -1;
  const title = document.createElement("h2");
  title.textContent = text("bookmarks", "书签");
  const rows = document.createElement("div");
  rows.className = "editor-bookmark-rows";
  const message = document.createElement("p");
  message.className = "editor-bookmark-message";
  message.setAttribute("aria-live", "polite");
  const toolbar = document.createElement("footer");
  toolbar.className = "editor-bookmark-toolbar";
  function button(label, action, className) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (className) element.className = className;
    element.onclick = action;
    return element;
  }
  const deleteButton = button(text("delete", "删除"), deleteSelected);
  const allButton = button(text("selectAll", "全选"), () => {
    selecting = true;
    editing = menu = null;
    perform(() => { selected = new Set(store.list(currentKey).map((item) => item.id)); render(); });
  });
  const selectButton = button(text("select", "选择"), () => {
    selecting = !selecting;
    editing = menu = null;
    selected.clear();
    render();
  });
  toolbar.append(deleteButton, allButton, selectButton);
  panel.append(title, message, rows, toolbar);
  overlay.append(panel);
  let currentKey = null;
  let selecting = false;
  let selected = new Set();
  let editing = null;
  let menu = null;
  let modal = null;
  let cancelConfirmation = null;
  let previousFocus = null;
  let closeTimer = null;
  let generation = 0;
  let lastOutsideTap = 0;
  const background = new Map();
  function lockBackground() {
    document.body.classList.add("editor-bookmarks-modal");
    for (const element of document.body.children) {
      if (element === overlay || ["SCRIPT", "STYLE", "LINK"].includes(element.tagName)) continue;
      if (!background.has(element)) background.set(element, element.inert);
      element.inert = true;
    }
  }
  function unlockBackground() {
    for (const [element, inert] of background) element.inert = inert;
    background.clear();
    document.body.classList.remove("editor-bookmarks-modal");
    previousFocus?.isConnected && previousFocus.focus();
  }
  const knownKeys = new WeakMap();
  const keyFor = (file) => file?.uri || (file?.id != null ? `untitled:${file.id}` : null);
  const viewFor = (file) => manager.getFilePane(file)?.editor;
  function available() {
    const file = manager.activeFile;
    return file?.type === "editor" && file.loaded && !file.loading && keyFor(file) && viewFor(file)?.state?.doc;
  }
  function fail(error) {
    console.error("Bookmark operation failed", error);
    message.textContent = text("bookmarkError", "书签无法保存，请检查应用存储空间。");
  }
  function perform(operation) {
    try { operation(); } catch (error) { fail(error); }
  }
  function render() {
    const items = store.list(currentKey);
    rows.replaceChildren();
    message.textContent = items.length ? "" : text("emptyBookmarks", "暂无书签");
    selectButton.setAttribute("aria-pressed", String(selecting));
    allButton.disabled = !items.length;
    deleteButton.disabled = !selected.size;
    for (const item of items) {
      const row = document.createElement("section");
      row.className = "editor-bookmark-row";
      row.dataset.bookmarkId = item.id;
      const time = document.createElement("time");
      time.dateTime = new Date(item.createdAt).toISOString();
      time.textContent = new Date(item.createdAt).toLocaleString();
      row.append(time);
      if (selecting) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(item.id);
        checkbox.className = "editor-bookmark-checkbox";
        checkbox.setAttribute("aria-label", `${text("select", "选择")} ${item.text}`);
        checkbox.onchange = () => {
          if (checkbox.checked) selected.add(item.id); else selected.delete(item.id);
          deleteButton.disabled = !selected.size;
        };
        row.append(checkbox);
      } else {
        const options = button("☰", () => perform(() => { menu = menu === item.id ? null : item.id; render(); }), "editor-bookmark-options");
        options.setAttribute("aria-label", text("bookmarkOptions", "书签选项"));
        options.setAttribute("aria-expanded", String(menu === item.id));
        row.append(options);
        if (menu === item.id) {
          const actions = document.createElement("div");
          actions.className = "editor-bookmark-actions";
          actions.append(
            button(text("bookmarkEdit", "编辑"), () => { editing = item.id; menu = null; render(); }),
            button(text("delete", "删除"), () => perform(() => { store.remove(currentKey, new Set([item.id])); menu = null; render(); })),
          );
          row.append(actions);
        }
      }
      if (editing === item.id) {
        const input = document.createElement("textarea");
        input.value = item.text;
        input.setAttribute("aria-label", text("editBookmark", "编辑书签文字"));
        const counter = document.createElement("span");
        counter.className = "editor-bookmark-counter";
        const save = button(text("save", "保存"), () => perform(() => { store.edit(currentKey, item.id, input.value); editing = null; render(); }));
        const cancel = button(text("cancel", "取消"), () => { editing = null; render(); });
        const count = () => {
          const length = Array.from(input.value).length;
          counter.textContent = `${length}/50`;
          save.disabled = length > 50;
          input.setAttribute("aria-invalid", String(length > 50));
        };
        input.oninput = count;
        count();
        row.append(input, counter, save, cancel);
        requestAnimationFrame(() => { if (input.isConnected) input.focus(); });
      } else {
        const excerpt = button(item.text, () => {
          if (selecting) {
            if (selected.has(item.id)) selected.delete(item.id); else selected.add(item.id);
            render();
            return;
          }
          const view = viewFor(manager.activeFile);
          const position = Math.min(item.position, view.state.doc.length);
          close();
          view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "start" }) });
          view.focus();
        }, "editor-bookmark-excerpt");
        row.append(excerpt);
      }
      rows.append(row);
    }
  }
  function confirmAll() {
    return new Promise((resolve) => {
      modal = document.createElement("div");
      modal.className = "editor-bookmark-confirm-overlay";
      const dialog = document.createElement("div");
      dialog.className = "editor-bookmark-confirm";
      dialog.setAttribute("role", "alertdialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", text("deleteAllBookmarks", "删除全部书签？"));
      const question = document.createElement("p");
      question.textContent = text("deleteAllBookmarks", "删除全部书签？");
      function finish(accepted) {
        modal?.remove(); modal = null; cancelConfirmation = null;
        panel.inert = false;
        if (deleteButton.isConnected) deleteButton.focus();
        resolve(accepted);
      }
      cancelConfirmation = () => finish(false);
      const cancel = button(text("cancel", "取消"), () => finish(false));
      dialog.append(question, cancel, button(text("delete", "删除"), () => finish(true)));
      modal.append(dialog);
      modal.onclick = (event) => { if (event.target === modal) outsideTap(); };
      panel.inert = true;
      overlay.append(modal);
      cancel.focus();
    });
  }
  async function deleteSelected() {
    const key = currentKey;
    const ids = new Set(selected);
    if (!ids.size) return;
    try {
      const all = ids.size === store.list(key).length;
      if (all && !(await confirmAll())) return;
      if (overlay.hidden || currentKey !== key) return;
      store.remove(key, ids);
      selected.clear(); editing = menu = null;
      render();
    } catch (error) { fail(error); }
  }
  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (cancelConfirmation) cancelConfirmation(); else close();
    } else if (event.key === "Tab") {
      const scope = modal || panel;
      const focusable = [...scope.querySelectorAll("button:not(:disabled), input, textarea")];
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault(); first.focus();
      }
    }
  }
  function close() {
    generation++;
    cancelConfirmation?.();
    overlay.classList.remove("is-open");
    overlay.classList.add("is-closing");
    overlay.inert = true;
    overlay.setAttribute("aria-hidden", "true");
    clearTimeout(closeTimer);
    if (overlay.isConnected) closeTimer = setTimeout(() => {
      overlay.hidden = true;
      overlay.remove();
      unlockBackground();
    }, 200);
    else unlockBackground();
    currentKey = null; selecting = false; selected.clear(); editing = menu = null;
    document.removeEventListener("keydown", onKeyDown, true);
  }
  function open() {
    if (!available()) return;
    const opening = ++generation;
    clearTimeout(closeTimer);
    lastOutsideTap = 0;
    overlay.classList.remove("is-closing");
    overlay.inert = false;
    overlay.removeAttribute("aria-hidden");
    previousFocus = document.activeElement;
    currentKey = keyFor(manager.activeFile);
    knownKeys.set(manager.activeFile, currentKey);
    selecting = false; selected.clear(); editing = menu = null;
    overlay.hidden = false;
    document.body.append(overlay);
    lockBackground();
    panel.getBoundingClientRect();
    document.addEventListener("keydown", onKeyDown, true);
    perform(render);
    requestAnimationFrame(() => { if (generation === opening && currentKey) { overlay.classList.add("is-open"); panel.focus(); } });
  }
  function add() {
    if (!available()) return;
    const file = manager.activeFile;
    const view = viewFor(file);
    const key = keyFor(file);
    knownKeys.set(file, key);
    try { store.add(key, view.state.doc.toString(), bookmarkScrollPosition(view)); open(); }
    catch (error) { open(); fail(error); }
  }
  function outsideTap() {
    if (!currentKey) return;
    const now = Date.now();
    if (lastOutsideTap && now - lastOutsideTap <= 400) close();
    else lastOutsideTap = now;
  }
  overlay.onclick = (event) => { if (event.target === overlay) outsideTap(); };
  manager.on("bookmark-document-changed", (file, changes) => perform(() => {
    const key = keyFor(file);
    if (!key) return;
    store.map(key, changes);
    if (currentKey === key) { selected.clear(); editing = menu = null; render(); }
  }));
  manager.on("rename-file", (file) => perform(() => {
    const previous = knownKeys.get(file), next = keyFor(file);
    if (previous && next && previous !== next) {
      store.move(previous, next);
      if (currentKey === previous) close();
    }
    if (next) knownKeys.set(file, next);
  }));
  return {
    open, close, add, available, store, overlay,
    update() {
      const file = manager.activeFile;
      const key = keyFor(file);
      if (currentKey && currentKey !== key) close();
      if (file && key && !knownKeys.has(file)) knownKeys.set(file, key);
    },
  };
}
