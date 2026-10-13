import { expect, it } from "vitest";
import { orderStorageEntries } from "../../src/pages/fileBrowser/storageOrder.js";
it("pins system entries, separates folders and sorts their names", () => {
  const doc={name:"Select document",openDoc:true}, internal={name:"Internal Storage",uuid:"internal-storage-picker"};
  expect(orderStorageEntries([{name:"Zebra"},internal,{name:"folder10"},{name:"Alpha"},doc,{name:"folder2"}]).map(entry=>entry.separator ? "separator" : entry.name)).toEqual(["Select document","Internal Storage","separator","Alpha","folder2","folder10","Zebra"]);
});
