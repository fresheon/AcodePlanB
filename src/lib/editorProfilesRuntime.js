import settings from "./settings";
import fonts from "./fonts";
import { createEditorProfileManager } from "./editorProfiles";
let manager;
export async function initializeEditorProfiles() {
  if (manager) return manager;
  const token = await new Promise((resolve, reject) => {
    if (window.cordova?.exec) window.cordova.exec(resolve, reject, "System", "editor-process-session", []);
    else resolve("browser-session");
  });
  manager = createEditorProfileManager({ settings, processToken: token, defaults: settings.defaults, prepareFont: font => fonts.injectFontFace(font) });
  await manager.start();
  return manager;
}
export function getEditorProfiles() { return manager; }
