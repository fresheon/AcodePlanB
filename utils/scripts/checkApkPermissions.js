const fs = require("node:fs");

function parsePermissions(report) {
  return [...report.matchAll(/^uses-permission(?:-sdk-\d+)?:\s+name='([^']+)'([^\n]*)/gm)]
    .map((match) => ({ name: match[1], attributes: match[2] }));
}

function checkApkPermissions(current, baseline) {
  const permissions = parsePermissions(current);
  if (!permissions.length) throw new Error("APK permission report is empty or unsupported");
  const previous = new Set(parsePermissions(baseline).map((permission) => permission.name));
  if (!previous.size) throw new Error("Baseline APK permission report is empty or unsupported");
  for (const permission of permissions) {
    if (permission.name.startsWith("android.permission.READ_MEDIA_")) {
      throw new Error(`Forbidden media permission: ${permission.name}`);
    }
    if (["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE"].includes(permission.name)) {
      const limit = /maxSdkVersion='?(\d+)/.exec(permission.attributes);
      if (!limit || Number(limit[1]) > 32) throw new Error(`Storage permission is not limited to Android 12 and earlier: ${permission.name}`);
    }
    if (!previous.has(permission.name)) throw new Error(`Unplanned permission addition: ${permission.name}`);
  }
  return permissions.map((permission) => permission.name).sort();
}

if (require.main === module) {
  const [current, baseline] = process.argv.slice(2);
  if (!current || !baseline) throw new Error("Usage: node checkApkPermissions.js current.txt baseline.txt");
  const permissions = checkApkPermissions(fs.readFileSync(current, "utf8"), fs.readFileSync(baseline, "utf8"));
  console.log("APK permission policy passed: no media read permissions or unplanned additions");
  console.log(permissions.join("\n"));
}
module.exports = { parsePermissions, checkApkPermissions };
