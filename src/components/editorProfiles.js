import { TEMP_PROFILE_ID } from "../lib/editorProfiles";

export function editorProfileDialog({ title, input = false, choices, validate, actionStack, variant }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div"); overlay.className = "editor-profile-dialog-overlay";
    const form = document.createElement("form"); form.className = "editor-profile-dialog"; form.setAttribute("role", "dialog");
    if (variant === "delete") form.classList.add("editor-profile-delete-dialog");
    form.setAttribute("aria-modal", "true"); form.setAttribute("aria-label", title);
    const label = document.createElement("label"); label.textContent = title;
    const field = document.createElement("input"); field.type = "text"; field.setAttribute("aria-label", title); field.autocomplete = "off";
    const error = document.createElement("p"); error.className = "editor-profile-error"; error.setAttribute("role", "alert");
    const actions = document.createElement("div"); actions.className = "editor-profile-dialog-actions";
    const inert = new Map([...document.body.children].filter(node => !["SCRIPT", "STYLE", "LINK"].includes(node.tagName)).map(node => [node, node.inert]));
    for (const node of inert.keys()) node.inert = true;
    function finish(value) { overlay.remove(); for (const [node, previous] of inert) node.inert = previous; document.removeEventListener("keydown", escape); actionStack?.remove("editor-profile-dialog"); resolve(value); }
    function escape(event) { if (event.key === "Escape") { event.preventDefault(); finish(null); } }
    for (const [text, value] of choices) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = text;
      if (variant === "delete") {
        const caption = document.createElement("span"); caption.className = "editor-profile-button-caption";
        for (const char of text) { const character = document.createElement("span"); character.textContent = char; caption.append(character); }
        button.replaceChildren(caption); button.setAttribute("aria-label", text);
      }
      button.onclick = () => {
        if (input && value !== null) {
          const message = validate?.(field.value); if (message) { error.textContent = message; field.focus(); return; }
          finish(field.value.trim());
        } else finish(value);
      };
      actions.append(button);
    }
    form.onsubmit = event => { event.preventDefault(); actions.lastElementChild.click(); };
    form.append(label); if (input) form.append(field, error); form.append(actions); overlay.append(form);
    document.body.append(overlay); document.addEventListener("keydown", escape);
    actionStack?.push({ id: "editor-profile-dialog", action: () => finish(null) });
    if (input) field.focus(); else actions.firstElementChild.focus();
  });
}
export default function editorProfilesRow({ manager, dialog = editorProfileDialog, exportToFolder, refresh = () => {} }) {
  const row = document.createElement("div"); row.className = "editor-profiles-row"; row.dataset.key = "editorProfiles";
  const select = document.createElement("select"); select.className = "editor-profiles-select"; select.setAttribute("aria-label", "方案框");
  const actions = document.createElement("div"); actions.className = "editor-profiles-actions";
  let busy = false;
  const buttons = {};
  function render() {
    const state = manager.state;
    select.replaceChildren();
    if (!state.profiles.length && !state.temporary) select.add(new Option("", ""));
    if (state.temporary) select.add(new Option(state.temporary.name, TEMP_PROFILE_ID));
    for (const profile of state.profiles) select.add(new Option(profile.name, profile.id));
    select.value = state.active;
    select.disabled = busy;
    for (const button of Object.values(buttons)) button.disabled = busy;
    buttons.delete.disabled = busy || !manager.current;
    buttons.export.disabled = busy || !manager.current;
  }
  async function run(action) {
    if (busy) return; busy = true; render();
    try { await action(); }
    catch (error) { await dialog({ title: error.message || "操作失败", choices: [["确定", null]] }); }
    finally { busy = false; render(); }
  }
  async function nameAndSave() {
    const name = await dialog({ title: "方案名称", input: true, validate: name => manager.nameError(name), choices: [["取消", null], ["确定", true]] });
    if (name !== null) manager.save(name);
  }
  const handlers = {
    delete: async () => {
      if (await dialog({ title: `删除方案“${manager.current.name}”？`, variant: "delete", choices: [["取消", false], ["删除", true]] })) { await manager.removeCurrent(); refresh(); }
    },
    save: async () => { if (manager.canOverwrite) manager.save(); else await nameAndSave(); },
    saveAs: nameAndSave,
    export: async () => {
      const choice = await dialog({ title: "保存当前的这个方案还是所有方案？", choices: [["保存当前", "current"], ["保存所有", "all"], ["取消", null]] });
      if (choice !== null) await exportToFolder(manager.exportData(choice === "all"));
    },
  };
  for (const [key, text] of [["delete", "删除"], ["save", "保存"], ["saveAs", "另存为"], ["export", "导出"]]) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
    button.onclick = () => run(handlers[key]); buttons[key] = button; actions.append(button);
  }
  select.onchange = () => { const id = select.value; run(async () => { await manager.select(id); if (id) refresh(); }); };
  row.append(select, actions); const off = manager.subscribe(render); render();
  return { element: row, destroy: off };
}
