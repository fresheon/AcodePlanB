export const TEMP_PROFILE_ID = "$temporary";
export const TEMP_PROFILE_NAME = "临时方案，尽快保存";
export const editorProfileKeys = [
  "editorBackgroundColor", "editorForegroundColor", "editorParagraphSpacing",
  "editorPaddingLeft", "editorPaddingRight", "editorPaddingTop", "editorPaddingBottom",
  "editorFont", "fontSize", "lineHeight", "textWrap", "wrappingIndent",
  "editorActiveLineColor", "editorSelectionColor", "editorCursorColor", "cursorWidth",
  "showShareButton", "shiftClickSelection", "rtlText",
  "editorPageTurning", "editorPageSwipeDistance", "editorPageLockVerticalScroll",
  "scrollbarSize", "scrollbarHeight", "scrollPastEnd", "leftMargin",
];
const storageKey = "acode-editor-profiles-v1";
const clone = value => JSON.parse(JSON.stringify(value));
export function profileSettings(values, defaults = {}) {
  return Object.fromEntries(editorProfileKeys.map(key => [key, values[key] === undefined ? defaults[key] ?? null : values[key]]));
}
export function createEditorProfileManager({ settings, storage = localStorage, processToken, defaults = {}, prepareFont = async () => {} }) {
  let state;
  try { state = JSON.parse(storage.getItem(storageKey) || "null"); } catch { state = null; }
  if (!state || !Array.isArray(state.profiles)) state = { profiles: [], active: "", temporary: null };
  for (const profile of state.profiles) profile.settings = profileSettings(profile.settings || {}, { ...defaults, ...settings.value });
  const temporaryName = baseId => {
    const base = state.profiles.find(profile => profile.id === baseId);
    return base ? `*未保存-${base.name}` : TEMP_PROFILE_NAME;
  };
  if (state.temporary) {
    state.temporary.name = temporaryName(state.temporary.baseId);
    state.temporary.settings = profileSettings(state.temporary.settings || {}, { ...defaults, ...settings.value });
  }
  let applying = 0, applyingValues = null;
  const listeners = new Set();
  const write = () => storage.setItem(storageKey, JSON.stringify(state));
  const notify = () => listeners.forEach(fn => fn());
  const current = () => state.active === TEMP_PROFILE_ID ? state.temporary : state.profiles.find(profile => profile.id === state.active);
  async function apply(values) {
    applying++;
    const patch = profileSettings(values, defaults);
    applyingValues = patch;
    try {
      await prepareFont(patch.editorFont);
      await settings.update(patch, false);
    } finally { if (--applying === 0) applyingValues = null; }
  }
  const markChanged = () => {
    if (applying && editorProfileKeys.every(key => settings.value[key] === applyingValues?.[key])) return;
    const origin = state.active === TEMP_PROFILE_ID ? state.temporary?.baseId : current()?.id;
    state.temporary = { id: TEMP_PROFILE_ID, name: temporaryName(origin), baseId: origin || null,
      processToken, settings: profileSettings(settings.value, defaults) };
    state.active = TEMP_PROFILE_ID;
    write(); notify();
  };
  for (const key of editorProfileKeys) settings.on(`update:${key}`, markChanged);
  const manager = {
    get state() { return clone(state); },
    get current() { const profile = current(); return profile ? clone(profile) : null; },
    get canOverwrite() { return state.active === TEMP_PROFILE_ID ? !!state.profiles.find(p => p.id === state.temporary?.baseId) : !!current(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    nameError(name) {
      name = String(name).trim();
      if (!name) return "请输入方案名称";
      if (name === TEMP_PROFILE_NAME) return "该名称用于临时方案，请使用其他名称";
      if (state.profiles.some(profile => profile.name === name)) return "名称不能和已有方案相同";
      return null;
    },
    async start() {
      if (state.temporary && state.temporary.processToken !== processToken) {
        state.temporary = null;
        state.active = state.profiles[0]?.id || "";
        write();
        await apply(current()?.settings || defaults);
      } else if (current()) await apply(current().settings);
      else {
        state.active = state.profiles[0]?.id || "";
        if (current()) await apply(current().settings);
      }
      write(); notify();
    },
    async select(id) {
      if (!id && (state.profiles.length || state.temporary)) throw new Error("请选择已有方案");
      if (id && id !== TEMP_PROFILE_ID && !state.profiles.some(p => p.id === id)) throw new Error("方案不存在");
      if (id === TEMP_PROFILE_ID && !state.temporary) throw new Error("临时方案不存在");
      state.active = id; write();
      if (current()) await apply(current().settings);
      notify();
    },
    save(name) {
      let target = state.active === TEMP_PROFILE_ID ? state.profiles.find(p => p.id === state.temporary?.baseId) : current();
      if (name !== undefined) {
        const error = manager.nameError(name); if (error) throw new Error(error);
        target = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, name: String(name).trim(), settings: {} };
        state.profiles.push(target);
      }
      if (!target || target.id === TEMP_PROFILE_ID) throw new Error("请输入方案名称");
      target.settings = profileSettings(settings.value, defaults);
      if (state.active === TEMP_PROFILE_ID) state.temporary = null;
      state.active = target.id; write(); notify();
      return clone(target);
    },
    async removeCurrent() {
      if (!current()) return;
      if (state.active === TEMP_PROFILE_ID) {
        const base = state.temporary.baseId;
        state.temporary = null;
        state.active = state.profiles.find(p => p.id === base)?.id || state.profiles[0]?.id || "";
      } else {
        const id = state.active;
        state.profiles = state.profiles.filter(p => p.id !== id);
        if (state.temporary?.baseId === id) { state.temporary.baseId = null; state.temporary.name = TEMP_PROFILE_NAME; }
        state.active = state.profiles[0]?.id || "";
      }
      write(); await apply(current()?.settings || defaults); notify();
    },
    exportData(all = false) {
      if (!current()) throw new Error("请先选择方案");
      const profiles = all ? [state.temporary, ...state.profiles].filter(Boolean) : [current()];
      return { format: "AcodeEditorSetting", version: 1, profiles: profiles.map(p => ({ name: p.name, settings: clone(p.settings) })) };
    },
    dispose() { for (const key of editorProfileKeys) settings.off(`update:${key}`, markChanged); listeners.clear(); },
  };
  return manager;
}
export async function writeEditorProfileExport(folder, payload, fsOperation, join) {
  let number = 0, filename;
  do { filename = `AcodeEditorSetting${number || ""}`; number++; } while (await fsOperation(join(folder, filename)).exists());
  const created = await fsOperation(folder).createFile(filename);
  const uri = typeof created === "string" ? created : created?.url || created?.uri || join(folder, filename);
  await fsOperation(uri).writeFile(JSON.stringify(payload, null, 2));
  return filename;
}
