// The world outside Herdr: code editors, Finder and the clipboard. This computer only: a
// path on another machine means nothing to an app here.
import { appHome, exec, knownAgents, readTextFile, setShared, shared, window } from "herdr";
import { EDITORS } from "../files/model.js";

const FOUND = "better-files.editors";
const ERROR = "better-files.error";

export const foundEditors = () => shared(FOUND) ?? [];

export const outsideMethods = {
  // One lookup per app ID, done once: Spotlight knows apps wherever they're installed.
  findEditors(cx, extra = []) {
    if (window()?.platform === "windows") return;
    cx.spawn(async (cx) => {
      const found = [];
      for (const editor of [...EDITORS, ...extra]) {
        const r = await exec(
          "mdfind",
          [`kMDItemCFBundleIdentifier == '${String(editor.bundle).replace(/'/g, "")}'`],
          {},
        ).catch(() => null);
        if (r?.code === 0 && r.stdout.trim()) found.push(editor);
      }
      setShared(FOUND, found);
      cx.notify();
    });
  },

  // Show diff is only offered where Better Changes can answer it.
  findBetterChanges(cx) {
    cx.spawn(async (cx) => {
      const manifest = await readTextFile(`${appHome()}/mods/better-changes/mod.json`).catch(
        () => null,
      );
      setShared("better-files.has-changes", Boolean(manifest));
      cx.notify();
    });
  },

  findNewAgents(on, cx) {
    cx.spawn(async (cx) => {
      try {
        const known = await knownAgents({ on: on ?? null });
        setShared(
          "better-files.new-agents",
          known.filter((a) => a.installed).map((a) => ({ key: a.key, name: a.name, run: a.run })),
        );
      } catch {
        setShared("better-files.new-agents", []);
      }
      cx.notify();
    });
  },

  async outside(args, what) {
    let r;
    if (window()?.platform === "windows") {
      // On Windows, use explorer or start to open files/folders
      const target = args[args.length - 1];
      r = await exec("cmd.exe", ["/c", "start", "", target], {}).catch((e) => ({ code: 1, stderr: String(e) }));
    } else {
      r = await exec("open", args, {}).catch((e) => ({ code: 1, stderr: String(e) }));
    }
    if (r.code !== 0) setShared(ERROR, `Could not ${what}: ${r.stderr?.trim() || "it failed"}`);
    else setShared(ERROR, null);
  },

  openInEditor(editor, path) {
    if (window()?.platform === "windows") {
      return this.outside([path], `open it`);
    }
    return this.outside(["-b", editor.bundle, path], `open it in ${editor.name}`);
  },

  openWithDefault(path) {
    return this.outside([path], "open it");
  },

  revealInFinder(path) {
    if (window()?.platform === "windows") {
      // In Windows, explorer /select,path highlights the item in File Explorer
      exec("cmd.exe", ["/c", "explorer", `/select,${path.replace(/\//g, "\\")}`], {}).catch(() => null);
      setShared(ERROR, null);
      return;
    }
    return this.outside(["-R", path], "show it in Finder");
  },
};
