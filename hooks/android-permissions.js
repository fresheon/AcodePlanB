const fs = require("node:fs");
const path = require("node:path");
const et = require("elementtree");

const blockedMediaPermissions = [
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
];

function restrictAndroidPermissions(source) {
  const tree = et.parse(source);
  const manifest = tree.getroot();
  manifest.attrib["xmlns:tools"] = "http://schemas.android.com/tools";
  for (const tag of ["uses-permission", "uses-permission-sdk-23"]) {
    for (const node of manifest.findall(tag)) {
      const name = node.attrib["android:name"];
      if (blockedMediaPermissions.includes(name)) {
        manifest.remove(node);
      } else if (["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE"].includes(name)) {
        const existing = Number(node.attrib["android:maxSdkVersion"]);
        node.attrib["android:maxSdkVersion"] = String(existing > 0 ? Math.min(existing, 32) : 32);
        node.attrib["tools:replace"] = "android:maxSdkVersion";
      }
    }
    // App-manifest removal markers also block declarations from Gradle libraries.
    for (const name of blockedMediaPermissions) {
      et.SubElement(manifest, tag, {
        "android:name": name,
        "tools:node": "remove",
      });
    }
  }
  return tree.write({ xml_declaration: true });
}

module.exports = function enforceAndroidPermissionPolicy(context) {
  if (!context.opts.platforms.includes("android")) return;
  const manifest = path.join(context.opts.projectRoot, "platforms/android/app/src/main/AndroidManifest.xml");
  fs.writeFileSync(manifest, restrictAndroidPermissions(fs.readFileSync(manifest, "utf8")));
};
module.exports.restrictAndroidPermissions = restrictAndroidPermissions;
