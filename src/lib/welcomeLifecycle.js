export const isOnlyWelcome = (file, files) => file.id === "welcome-tab" && files.length === 1;
export function refreshWelcomeTabs(files) {
  for (const file of files) if (file.id === "welcome-tab") file.refreshTabCloseButton();
}
export async function openWelcomeWhenEmpty(manager, openWelcome) {
  if (!manager.files.length) await openWelcome();
}
