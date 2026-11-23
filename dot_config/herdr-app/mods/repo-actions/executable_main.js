// One-shot action mod opened by a key (`mod.open:repo-actions`): shows a
// brief progress dialog, resolves the focused pane's git repo root, opens it
// in VS Code, and closes itself.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, exec, panes, focused, notify, checking, theme } from "herdr";

async function repoRoot() {
  const p = panes().find((x) => x.focused) ?? null;
  const cwd = p?.cwd ?? focused()?.cwd ?? null;
  if (!cwd) return null;
  try {
    const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 8000 });
    if (r.code === 0 && String(r.stdout ?? "").trim()) return String(r.stdout).trim();
  } catch {}
  return cwd;
}

async function openVscode() {
  const dir = await repoRoot();
  if (!dir) {
    notify({ title: "Open in VS Code", body: "No focused folder to open.", level: "warning" });
    return;
  }
  // On Windows `code` is a batch shim; exec spawns without a shell, so
  // plain `code` first, then through cmd.exe.
  for (const [cmd, args] of [["code", [dir]], ["cmd", ["/C", "code", dir]]]) {
    try {
      const r = await exec(cmd, args, { timeout: 15000 });
      if (r.code === 0) return;
    } catch {}
  }
  notify({ title: "Open in VS Code", body: `Could not run: code ${dir}`, level: "error" });
}

export default class RepoActions extends View {
  init(_props, cx) {
    if (checking()) return;
    cx.spawn(async () => {
      try {
        await openVscode();
      } finally {
        closeOverlay(props()?.overlay);
      }
    });
  }

  render() {
    const t = theme();
    return v_flex().size_full().bg(t.popover).items_center().justify_center().gap(10).rounded(10)
      .child(h_flex().gap(8).items_center()
        .child(div().text_size(14).text_color(t.accent).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90).child("⠋"))
        .child(div().text_size(13).font_medium().text_color(t.foreground).child("Opening in VS Code…")));
  }
}
