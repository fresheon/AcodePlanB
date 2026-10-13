// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorProfileManager, editorProfileKeys, TEMP_PROFILE_ID, TEMP_PROFILE_NAME, writeEditorProfileExport } from "lib/editorProfiles";
export function fakeSettings() {
  const events = new Map();
  return { value: Object.fromEntries(editorProfileKeys.map(key => [key, key === "fontSize" ? "18px" : null])),
    on: (key, fn) => events.set(key, [...events.get(key) || [], fn]), off: (key, fn) => events.set(key, (events.get(key) || []).filter(value => value !== fn)),
    async update(patch) { const changed = Object.keys(patch).filter(key => this.value[key] !== patch[key]); Object.assign(this.value, patch); for (const key of changed) for (const fn of events.get(`update:${key}`) || []) fn(); },
  };
}
const setup = token => { const settings = fakeSettings(); return { settings, manager: createEditorProfileManager({ settings, processToken: token || "one", defaults: { fontSize: "12px" } }) }; };
beforeEach(() => localStorage.clear());
describe("editor layout profiles", () => {
  it("saves/applies every scrolling setting and labels edits to a named profile", async () => {
    const { settings, manager } = setup(); await manager.start();
    const scrolling = { editorPageTurning: true, editorPageSwipeDistance: 77, editorPageLockVerticalScroll: true, scrollbarSize: 15, scrollbarHeight: 60, scrollPastEnd: "full", leftMargin: 35 };
    await settings.update(scrolling); expect(manager.current.name).toBe(TEMP_PROFILE_NAME);
    const a = manager.save("方案A");
    await settings.update({ scrollbarHeight: 20 }); expect(manager.current.name).toBe("*未保存-方案A");
    expect(manager.current.baseId).toBe(a.id); manager.save(); expect(manager.current.name).toBe("方案A");
    await settings.update({ editorPageTurning: false }); await manager.select(a.id);
    expect(settings.value).toMatchObject({ ...scrolling, scrollbarHeight: 20 });
  });
  it("upgrades older profiles with current scrolling values without resetting them", async () => {
    localStorage.setItem("acode-editor-profiles-v1", JSON.stringify({ profiles: [{ id: "a", name: "方案A", settings: { fontSize: "24px" } }], active: "a", temporary: null }));
    const settings = fakeSettings(); settings.value.scrollbarHeight = 60;
    const manager = createEditorProfileManager({ settings, processToken: "one", defaults: { scrollbarHeight: 50 } });
    await manager.start(); expect(settings.value.scrollbarHeight).toBe(60); expect(settings.value.fontSize).toBe("24px");
    expect(Object.keys(manager.current.settings)).toHaveLength(26);
  });
  it("starts blank and creates only one temporary profile for all changes", async () => {
    const { settings, manager } = setup(); await manager.start();
    expect(manager.current).toBeNull();
    await settings.update({ fontSize: "25px" }); await settings.update({ editorPaddingTop: 45 });
    expect(manager.state.profiles).toHaveLength(0);
    expect(manager.state.active).toBe(TEMP_PROFILE_ID);
    expect(manager.current.name).toBe(TEMP_PROFILE_NAME);
    expect(manager.current.settings).toMatchObject({ fontSize: "25px", editorPaddingTop: 45 });
    expect(Object.keys(manager.current.settings)).toEqual(editorProfileKeys);
  });
  it("names a new profile, rejects duplicates, and saves changes into the originating profile", async () => {
    const { settings, manager } = setup(); await manager.start();
    const a = manager.save("方案A");
    await settings.update({ fontSize: "22px" });
    expect(manager.canOverwrite).toBe(true); manager.save();
    expect(manager.current.id).toBe(a.id); expect(manager.state.profiles).toHaveLength(1);
    expect(manager.current.settings.fontSize).toBe("22px"); expect(manager.state.temporary).toBeNull();
    expect(() => manager.save("方案A")).toThrow("名称不能和已有方案相同");
    expect(() => manager.save(TEMP_PROFILE_NAME)).toThrow();
    manager.save("方案B"); expect(manager.state.profiles).toHaveLength(2);
  });
  it("applies all profile values without marking the application itself temporary", async () => {
    const { settings, manager } = setup(); await manager.start();
    const a = manager.save("A"); await settings.update({ fontSize: "30px", editorPaddingTop: 50 }); const b = manager.save("B");
    await manager.select(a.id); expect(settings.value.fontSize).toBe("18px"); expect(manager.state.temporary).toBeNull();
    await manager.select(b.id); expect(settings.value.editorPaddingTop).toBe(50); expect(manager.state.active).toBe(b.id);
  });
  it("does not ignore a genuine edit while a selected profile is finishing its settings write", async () => {
    const { settings, manager } = setup(); await manager.start(); const a = manager.save("A");
    await settings.update({ fontSize: "24px" }); manager.save("B");
    const update = settings.update.bind(settings);
    let entered, finish;
    const started = new Promise(resolve => entered = resolve);
    const pending = new Promise(resolve => finish = resolve);
    settings.update = async patch => { await update(patch); entered(); await pending; };
    const selection = manager.select(a.id); await started;
    await update({ fontSize: "35px" }); finish(); await selection;
    expect(manager.current.id).toBe(TEMP_PROFILE_ID);
    expect(manager.current.settings.fontSize).toBe("35px");
    expect(manager.state.temporary.baseId).toBe(a.id);
  });
  it("retains temporary settings in the same process but deletes them after process death and selects the first saved profile", async () => {
    let { settings, manager } = setup("process-one"); await manager.start();
    const a = manager.save("A"); await settings.update({ fontSize: "23px" }); const b = manager.save("B");
    await settings.update({ fontSize: "35px" }); manager.dispose();
    ({ settings, manager } = setup("process-one")); await manager.start();
    expect(manager.current.id).toBe(TEMP_PROFILE_ID); expect(settings.value.fontSize).toBe("35px"); manager.dispose();
    ({ settings, manager } = setup("process-two")); await manager.start();
    expect(manager.current.id).toBe(a.id); expect(manager.current.id).not.toBe(b.id);
    expect(settings.value.fontSize).toBe("18px"); expect(manager.state.temporary).toBeNull();
  });
  it("restores defaults after discarding an unnamed-only temporary profile", async () => {
    let { settings, manager } = setup("one"); await manager.start(); await settings.update({ fontSize: "35px" }); manager.dispose();
    ({ settings, manager } = setup("two")); await manager.start(); expect(manager.current).toBeNull(); expect(settings.value.fontSize).toBe("12px");
  });
  it("preserves a single temporary entry while choosing other saved profiles and exports temporary/current/all values", async () => {
    const { settings, manager } = setup(); await manager.start(); const a = manager.save("A");
    await settings.update({ fontSize: "28px" }); await manager.select(a.id);
    expect(manager.state.temporary.settings.fontSize).toBe("28px");
    expect(manager.exportData(true).profiles.map(p => p.name)).toEqual(["*未保存-A", "A"]);
    expect(manager.exportData(false).profiles).toHaveLength(1);
    await manager.select(""); expect(() => manager.exportData()).toThrow();
  });
  it("deletes the selected saved profile and applies the next one", async () => {
    const { settings, manager } = setup(); await manager.start(); manager.save("A"); await settings.update({ fontSize: "23px" }); manager.save("B");
    await manager.removeCurrent(); expect(manager.current.name).toBe("A"); expect(settings.value.fontSize).toBe("18px");
    await manager.removeCurrent(); expect(manager.current).toBeNull();
  });
  it("exports JSON to a collision-free AcodeEditorSetting filename without replacing existing files", async () => {
    const files = new Map([["dir/AcodeEditorSetting", "old"], ["dir/AcodeEditorSetting1", "old1"]]);
    const fs = path => ({ exists: async () => files.has(path), createFile: async name => { files.set(path + "/" + name, ""); return path + "/" + name; }, writeFile: async text => files.set(path, text) });
    const name = await writeEditorProfileExport("dir", { format: "AcodeEditorSetting", profiles: [] }, fs, (a,b) => a+"/"+b);
    expect(name).toBe("AcodeEditorSetting2"); expect(files.get("dir/AcodeEditorSetting")).toBe("old");
    expect(JSON.parse(files.get("dir/AcodeEditorSetting2")).format).toBe("AcodeEditorSetting");
  });
});
