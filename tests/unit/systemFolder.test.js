// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { pickSystemFolder, systemFolderButton } from "../../src/pages/fileBrowser/systemFolder.js";
it("returns the system-authorized folder URI for saving and handles cancellation", async () => {
  const uri = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FReading";
  const native = { getStorageAccessPermission: vi.fn((uuid, resolve) => resolve(uri)) };
  expect(await pickSystemFolder(native)).toEqual({ type: "folder", url: uri, name: "Reading" });
  expect(native.getStorageAccessPermission.mock.calls[0][0]).toBe("");
  expect(await pickSystemFolder({ getStorageAccessPermission: (_, resolve, reject) => reject("Operation cancelled") })).toBeNull();
  await expect(pickSystemFolder({ getStorageAccessPermission: (_, resolve, reject) => reject("No write permission") })).rejects.toBe("No write permission");
});
it("opens the system folder picker from both touch/click and keyboard activation", () => {
  const select = vi.fn(); const button = systemFolderButton("选择文件夹", select);
  button.click(); button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); button.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
  expect(select).toHaveBeenCalledTimes(3);
  expect(button.getAttribute("aria-label")).toBe("选择文件夹");
});
