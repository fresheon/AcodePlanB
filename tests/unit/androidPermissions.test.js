import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const et = require("elementtree");
const { restrictAndroidPermissions } = require("../../hooks/android-permissions.js");
const { checkApkPermissions } = require("../../utils/scripts/checkApkPermissions.js");

describe("Android permission policy", () => {
  it("replaces media grants with merger removals and preserves unrelated permissions", () => {
    const source = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-permission android:name="android.permission.READ_MEDIA_AUDIO"/>
      <uses-permission-sdk-23 android:name="android.permission.READ_MEDIA_IMAGES"/>
      <uses-permission android:name="android.permission.INTERNET"/>
      <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
      <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/>
      <application android:label="Acode"/>
    </manifest>`;
    const output = restrictAndroidPermissions(source);
    expect(restrictAndroidPermissions(output)).toBe(output);
    const root = et.parse(output).getroot();
    const permissions = root.findall("uses-permission");
    expect(permissions.find((node) => node.attrib["android:name"] === "android.permission.INTERNET").attrib["tools:node"]).toBeUndefined();
    expect(permissions.find((node) => node.attrib["android:name"] === "android.permission.READ_EXTERNAL_STORAGE").attrib["android:maxSdkVersion"]).toBe("32");
    expect(permissions.find((node) => node.attrib["android:name"] === "android.permission.WRITE_EXTERNAL_STORAGE").attrib["android:maxSdkVersion"]).toBe("28");
    for (const tag of ["uses-permission", "uses-permission-sdk-23"]) {
      const media = root.findall(tag).filter((node) => node.attrib["android:name"].includes("READ_MEDIA_"));
      expect(media).toHaveLength(4);
      expect(media.every((node) => node.attrib["tools:node"] === "remove")).toBe(true);
    }
    expect(root.find("application").attrib["android:label"]).toBe("Acode");
  });

  const baseline = "uses-permission: name='android.permission.INTERNET'\nuses-permission: name='android.permission.READ_EXTERNAL_STORAGE'\n";
  it("accepts existing permissions with bounded legacy storage", () => {
    const current = baseline.replace("name='android.permission.READ_EXTERNAL_STORAGE'", "name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'");
    expect(checkApkPermissions(current, baseline)).toHaveLength(2);
  });
  it("rejects every media permission even if it was already in the baseline", () => {
    for (const suffix of ["AUDIO", "IMAGES", "VIDEO", "VISUAL_USER_SELECTED"]) {
      const media = `uses-permission: name='android.permission.READ_MEDIA_${suffix}'\n`;
      expect(() => checkApkPermissions(media, baseline + media)).toThrow(/Forbidden media/);
    }
  });
  it("rejects unplanned permission additions", () => {
    expect(() => checkApkPermissions("uses-permission: name='android.permission.CAMERA'\n", baseline)).toThrow(/Unplanned/);
  });
  it("rejects unbounded legacy storage and missing permission reports", () => {
    expect(() => checkApkPermissions(baseline, baseline)).toThrow(/not limited/);
    expect(() => checkApkPermissions("", baseline)).toThrow(/empty/);
  });
});
