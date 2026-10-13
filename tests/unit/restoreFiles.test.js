// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	instances: [],
}));

vi.mock("lib/editorFile", () => ({
	default: class MockEditorFile {
		constructor(filename, options) {
			this.filename = filename;
			this.options = options;
			this.loaded = new Promise((resolve, reject) => {
				this.resolveLoad = resolve;
				this.rejectLoad = reject;
				this.remove = vi.fn();
			});
			runtime.instances.push(this);
		}

		load() {
			return this.loaded;
		}
	},
}));

import restoreFiles from "lib/restoreFiles";

describe("restored file loading", () => {
	beforeEach(() => {
		runtime.instances.length = 0;
		localStorage.clear();
	});

	it("waits for every local tab and activates the last tab by default", async () => {
		let completed = false;
		const restoration = restoreFiles([
			{ id: "one", filename: "one.js", uri: "file:///one.js" },
			{ id: "two", filename: "two.js", uri: "file:///two.js" },
		]).then(() => {
			completed = true;
		});

		expect(runtime.instances).toHaveLength(2);
		expect(runtime.instances.map((file) => file.options.render)).toEqual([
			false,
			true,
		]);
		expect(completed).toBe(false);

		runtime.instances[0].resolveLoad();
		await Promise.resolve();
		expect(completed).toBe(false);

		runtime.instances[1].resolveLoad();
		await restoration;
		expect(completed).toBe(true);
	});

	it("restores every tab read-only with its durable reading position", async () => {
		localStorage.setItem("acode-reading-positions-v1", JSON.stringify({ one: { uri: "file:///one.js", position: { from: 80, offset: -3, left: 0 } } }));
		const load = restoreFiles([{ id: "one", filename: "one.js", uri: "file:///one.js", editable: true }]);
		expect(runtime.instances[0].options).toMatchObject({ editable: false, silentSessionRestore: true, readingPosition: { from: 80, offset: -3, left: 0 } });
		runtime.instances[0].resolveLoad();
		await load;
	});

	it("silently drops one unavailable path without aborting the other files", async () => {
		const result = restoreFiles([{ id: "gone", filename: "gone.txt", uri: "file:///gone.txt" }, { id: "kept", filename: "kept.txt", uri: "file:///kept.txt" }]);
		runtime.instances[0].rejectLoad(new Error("path moved"));
		runtime.instances[1].resolveLoad();
		await result;
		expect(runtime.instances[0].remove).toHaveBeenCalledWith(true, { ignorePinned: true });
	});

	it.each(["ftp", "sftp", "http", "https", "gh", "plugin", "custom"])(
		"does not block startup on an unresolved %s tab",
		async (protocol) => {
			await restoreFiles([
				{
					id: "remote",
					filename: "remote.js",
					uri: `${protocol}://example.com/remote.js`,
				},
			]);

			expect(runtime.instances).toHaveLength(1);
		},
	);
});
