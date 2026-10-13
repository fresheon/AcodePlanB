const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { rspack } = require("@rspack/core");
const { chromium } = require("playwright");
(async () => {
  const repo = path.resolve(__dirname, "../.."); const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "acode-profiles-")); let browser;
  try {
    await new Promise((resolve, reject) => {
      const compiler = rspack({ mode: "development", entry: path.join(__dirname, "fixtures/editorProfiles.js"), output: { path: temporary, filename: "bundle.js" }, resolve: { modules: [path.join(repo, "node_modules")], extensions: [".js"] } });
      compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
    });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 412, height: 732 }, hasTouch: true });
    await page.setContent('<html><body style="margin:0"></body></html>');
    await page.addStyleTag({ content: fs.readFileSync(path.join(repo, "www/build/main.css"), "utf8") });
    const styles = path.join(repo, "www/build");
    for (const file of fs.readdirSync(styles).filter(file => file.endsWith(".css") && file !== "main.css")) {
      const content = fs.readFileSync(path.join(styles, file), "utf8");
      if (content.includes("editor-profiles-row")) await page.addStyleTag({ content });
    }
    await page.addScriptTag({ content: fs.readFileSync(path.join(temporary, "bundle.js"), "utf8") });
    await page.evaluate(() => setupEditorProfiles());
    assert.equal(await page.locator(".editor-profiles-heading").textContent(), "保存视觉方案");
    const choose = page.getByRole("combobox", { name: "方案框" });
    const button = text => page.locator(".editor-profiles-actions").getByRole("button", { name: text, exact: true });
    assert.equal(await choose.inputValue(), ""); assert(await button("删除").isDisabled()); assert(await button("导出").isDisabled());
    const width = await choose.evaluate(el => el.getBoundingClientRect().width); assert.equal(width, 186);
    await button("保存").tap(); await page.getByRole("textbox", { name: "方案名称" }).fill("方案A"); await page.getByRole("dialog").getByRole("button", { name: "确定", exact: true }).tap();
    assert.equal(await choose.locator("option:checked").textContent(), "方案A");
    await page.evaluate(() => profiles.settings.update({ fontSize: "24px", editorPaddingTop: 47 }));
    assert.equal(await choose.locator("option:checked").textContent(), "*未保存-方案A");
    await button("保存").tap(); assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await choose.locator("option:checked").textContent(), "方案A");
    await button("另存为").tap(); await page.getByRole("textbox").fill("方案A"); await page.getByRole("dialog").getByRole("button", { name: "确定", exact: true }).tap();
    assert.equal(await page.getByRole("alert").textContent(), "名称不能和已有方案相同");
    await page.getByRole("textbox").fill("方案B"); await page.getByRole("dialog").getByRole("button", { name: "确定", exact: true }).tap();
    await page.evaluate(() => profiles.settings.update({ fontSize: "30px" }));
    await page.evaluate(() => profiles.restart("one")); assert.equal(await choose.locator("option:checked").textContent(), "*未保存-方案B");
    await page.evaluate(() => profiles.restart("two")); assert.equal(await choose.locator("option:checked").textContent(), "方案A"); assert.equal(await page.evaluate(() => profiles.settings.value.fontSize), "24px");
    await button("导出").tap(); assert.deepEqual(await page.getByRole("dialog").getByRole("button").allTextContents(), ["保存当前", "保存所有", "取消"]);
    await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).tap(); assert.equal(await page.evaluate(() => profiles.folderVisits), 0);
    await button("导出").tap(); await page.getByRole("dialog").getByRole("button", { name: "保存当前", exact: true }).tap();
    await page.waitForFunction(() => profiles.folderVisits === 1);
    let exported = await page.evaluate(() => profiles.exports); assert.equal(exported[0][1], "untouched"); assert.equal(JSON.parse(exported[1][1]).profiles.length, 1); assert.equal(exported[1][0], "chosen/AcodeEditorSetting1");
    await button("导出").tap(); await page.getByRole("dialog").getByRole("button", { name: "保存所有", exact: true }).tap(); await page.waitForFunction(() => profiles.folderVisits === 2);
    exported = await page.evaluate(() => profiles.exports); assert.equal(JSON.parse(exported[2][1]).profiles.length, 2); assert.equal(exported[2][0], "chosen/AcodeEditorSetting2");
    await button("删除").tap();
    const deletion = await page.getByRole("dialog").evaluate(dialog => {
      const buttons = [...dialog.querySelectorAll("button")]; const first = buttons[0].getBoundingClientRect(), second = buttons[1].getBoundingClientRect();
      const chars = buttons[0].querySelectorAll(".editor-profile-button-caption > span");
      return { width: dialog.getBoundingClientRect().width, gap: second.left - first.right, buttonWidth: first.width, characterGap: chars[1].getBoundingClientRect().left - chars[0].getBoundingClientRect().right };
    });
    assert(Math.abs(deletion.width - Math.min(412*.85,380)*2/3) < 1, JSON.stringify(deletion));
    assert.equal(deletion.gap, 50); assert(Math.abs(deletion.buttonWidth - (28+12)*4/3) < 1); assert.equal(deletion.characterGap,14);
    await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).tap(); assert.equal(await choose.locator("option:checked").textContent(), "方案A");
    await button("删除").tap(); await page.getByRole("dialog").getByRole("button", { name: "删除", exact: true }).tap(); assert.equal(await choose.locator("option:checked").textContent(), "方案B");
    await button("另存为").tap(); await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).tap(); assert.equal(await choose.locator("option").count(), 1); assert.equal(await choose.locator('option[value=""]').count(),0);
    for (const viewport of [{width:320,height:732}, {width:1280,height:800}]) {
      await page.setViewportSize(viewport);
      const bounds = await page.locator(".editor-profiles-row").evaluate(row => {
        row.scrollLeft = 0;
        const select = row.querySelector("select").getBoundingClientRect(); const buttons = [...row.querySelectorAll("button")].map(button => button.getBoundingClientRect());
        return { select: select.width, gaps: [buttons[0].left-select.right, ...buttons.slice(1).map((button,index) => button.left-buttons[index].right)], width: row.clientWidth, scrollWidth: row.scrollWidth };
      });
      assert.equal(bounds.select, viewport.width/2-20); assert.equal(bounds.gaps[0],35); for(const gap of bounds.gaps.slice(1)) assert(Math.abs(gap-(Math.min(30,Math.max(12,viewport.width*.02))+5))<1);
      if(viewport.width===320) assert(bounds.scrollWidth > bounds.width);
      await button("导出").tap(); await page.getByRole("dialog").getByRole("button", {name:"取消",exact:true}).tap();
    }
    await button("导入").tap();
    await page.waitForFunction(() => profiles.manager.current.name === "导入方案");
    assert.equal(await choose.locator("option:checked").textContent(), "导入方案");
    assert.equal(await page.evaluate(() => profiles.settings.value.fontSize), "26px");
    console.log("Editor profiles browser checks passed: real naming/cancel/duplicate/save/save-as/delete/export/import controls, process-scoped temporary settings, JSON exports and phone/tablet layout.");
  } finally { await browser?.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
