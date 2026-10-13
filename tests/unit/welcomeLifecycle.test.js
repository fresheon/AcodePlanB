import { expect, it, vi } from "vitest";
import { isOnlyWelcome, refreshWelcomeTabs, openWelcomeWhenEmpty } from "../../src/lib/welcomeLifecycle.js";
it("keeps an only welcome tab protected but allows closing it alongside a document", () => {
  const welcome={id:"welcome-tab",refreshTabCloseButton:vi.fn()}, document={id:"doc"};
  expect(isOnlyWelcome(welcome,[welcome])).toBe(true);
  expect(isOnlyWelcome(welcome,[welcome,document])).toBe(false);
  refreshWelcomeTabs([document,welcome]); expect(welcome.refreshTabCloseButton).toHaveBeenCalledOnce();
});
it("reopens welcome after the final document closes and retains an existing welcome", async () => {
  const manager={files:[]}, welcome={id:"welcome-tab"};
  const open=vi.fn(()=>manager.files.push(welcome));
  await openWelcomeWhenEmpty(manager,open); await openWelcomeWhenEmpty(manager,open);
  expect(manager.files).toEqual([welcome]); expect(open).toHaveBeenCalledOnce();
});
