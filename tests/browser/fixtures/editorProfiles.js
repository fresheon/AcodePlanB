import { createEditorProfileManager, editorProfileKeys, writeEditorProfileExport } from "../../../src/lib/editorProfiles.js";
import editorProfilesRow from "../../../src/components/editorProfiles.js";
window.setupEditorProfiles = async () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  const events = new Map();
  const settings = { value: Object.fromEntries(editorProfileKeys.map(key => [key, key === "fontSize" ? "18px" : null])),
    on(key, fn) { events.set(key, [...events.get(key) || [], fn]); },
    off(key, fn) { events.set(key, (events.get(key) || []).filter(value => value !== fn)); },
    async update(patch) { const changed = Object.keys(patch).filter(key => this.value[key] !== patch[key]); Object.assign(this.value, patch); for (const key of changed) for (const fn of events.get(`update:${key}`) || []) fn(); },
  };
  let manager = createEditorProfileManager({ settings, storage, processToken: "one", defaults: { fontSize: "12px" } });
  await manager.start();
  const files = new Map([["chosen/AcodeEditorSetting", "untouched"]]); let folderVisits = 0;
  const fs = path => ({ exists: async () => files.has(path), createFile: async name => { files.set(path + "/" + name, ""); return path + "/" + name; }, writeFile: async text => files.set(path, text) });
  let row;
  const mount = () => {
    row?.destroy(); row?.element.remove();
    row = editorProfilesRow({ manager, importFromFile: async () => JSON.stringify({format:"AcodeEditorSetting",version:1,profiles:[{name:"导入方案",settings:{fontSize:"26px"}}]}), exportToFolder: async payload => { folderVisits++; await writeEditorProfileExport("chosen", payload, fs, (a,b) => a+"/"+b); } });
    document.body.append(row.element);
  };
  mount();
  window.profiles = { settings, get manager() { return manager; }, get exports() { return [...files]; }, get folderVisits() { return folderVisits; },
    async restart(token) { manager.dispose(); manager = createEditorProfileManager({ settings, storage, processToken: token, defaults: { fontSize: "12px" } }); await manager.start(); mount(); } };
};
