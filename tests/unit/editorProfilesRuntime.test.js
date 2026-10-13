// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
it("imports without traversing settings dependencies and initializes only with the ready settings instance", async () => {
  vi.resetModules(); localStorage.clear();
  const runtime = await import("../../src/lib/editorProfilesRuntime.js");
  expect(runtime.getEditorProfiles()).toBeUndefined();
  const settings = { value: { fontSize: "12px" }, defaults: { fontSize: "12px" }, on: vi.fn(), off: vi.fn(), update: vi.fn() };
  const fonts = { injectFontFace: vi.fn() };
  window.cordova = { exec: vi.fn(resolve => resolve("native-process")) };
  const manager = await runtime.initializeEditorProfiles({ settings, fonts });
  expect(settings.on).toHaveBeenCalledTimes(19);
  expect(manager.current).toBeNull();
  expect(await runtime.initializeEditorProfiles({ settings, fonts })).toBe(manager);
  manager.dispose(); delete window.cordova;
});
