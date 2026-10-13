export function orderStorageEntries(entries) {
  const document = entries.find(entry => entry.openDoc);
  const internal = entries.find(entry => ["internal-storage", "internal-storage-picker"].includes(entry.uuid));
  const folders = entries.filter(entry => entry !== document && entry !== internal && !entry.separator);
  folders.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" }));
  return [document, internal, folders.length ? { separator: true } : null, ...folders].filter(Boolean);
}
