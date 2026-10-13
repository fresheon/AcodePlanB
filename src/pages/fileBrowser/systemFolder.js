// Use the existing SAF grant; no broad storage permission is required.
export function pickSystemFolder(sdcard) {
  return new Promise((resolve, reject) => {
    sdcard.getStorageAccessPermission("", uri => {
      if (!uri) { resolve(null); return; }
      let name;
      try { name = decodeURIComponent(uri).split(":").pop().split("/").pop(); } catch { name = ""; }
      resolve({ type: "folder", url: uri, name: name || "Internal storage" });
    }, error => {
      if (/cancelled|canceled/i.test(String(error?.message || error))) resolve(null);
      else reject(error);
    });
  });
}
export function systemFolderButton(title, select) {
  const button = document.createElement("span");
  button.className = "icon folder_open"; button.dataset.action = "select-system-folder";
  button.title = title; button.setAttribute("aria-label", title); button.setAttribute("role", "button"); button.tabIndex = 0;
  button.onclick = select;
  button.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } };
  return button;
}
