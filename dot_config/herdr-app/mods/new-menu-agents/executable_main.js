import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, spaces, panes, knownAgents, run, openOverlay, closeOverlay, props, window, keys, shared, setShared, readTextFile, appHome } from "herdr";

// The last agents each machine reported, shown at once while knownAgents() checks again.
const KNOWN = "new-menu.agents";

// Start a tab or space, asked first where: empty keeps Herdr's default (the focused terminal's folder).
function askNew(space, command, title, args) {
  const remote = Boolean(space?.machine);
  openOverlay({ mod: "dir-prompt", kind: "dialog", width: 520, height: 440, props: {
    title, ok: command === "space.new" ? "Create space" : "Start",
    remote, cwd: remote ? null : (panes().find(p => p.focused)?.cwd ?? null),
    command, args } });
}

function shortcut(name) {
  const k = keys().find(b => b.section === "global" && b.action === name);
  if (!k?.keys.trim()) return "";
  const mac = window()?.platform === "macos";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return k.keys.trim().split(/\s+/).map(stroke => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map(m => alias[m.toLowerCase()] ?? m.toLowerCase()));
    if (/^[A-Z]$/.test(key)) held.add("shift");
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...Object.keys(names).filter(m => held.has(m)).map(m => names[m]), label].join(mac ? "" : "+");
  }).join(" ");
}

export default class NewMenu extends View {
  init(_props, cx) {
    const machine = spaces().find(s => s.active)?.machine;
    const where = machine ?? "";
    this.agents = shared(KNOWN)?.[where] ?? [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async cx => {
      const extras = await this.configured();
      this.agents = this.merge(this.agents, extras);
      cx.notify();
      try {
        const known = await knownAgents({ on: machine });
        this.agents = this.merge(known, extras);
        setShared(KNOWN, { ...shared(KNOWN), [where]: this.agents });
      }
      catch {
        this.failed = true;
        this.agents = this.merge(this.agents, extras);
      }
      cx.notify();
    });
  }
  row(id, icon, name, action, hint = "", enabled = true) {
    const t = theme();
    return h_flex().id(id).h(31).px(9).gap(10).rounded(7).items_center().flex_none()
      .text_color(enabled ? t.foreground : t.dim).when(enabled, el => el.hover(s => s.bg(t.selected)))
      .on_click(() => { if (enabled) { closeOverlay(props().overlay); action(); } })
      .child(icon).child(div().flex_1().child(name)).child(div().text_size(11).text_color(t.dim).child(hint));
  }
  async configured() {
    const home = String(appHome() ?? "");
    for (const path of [`${home}/programs.json`, `${home}\\programs.json`, "programs.json"]) {
      try {
        const text = await readTextFile(path);
        if (!text) continue;
        const file = JSON.parse(text);
        return Object.entries(file.programs ?? {}).filter(([, p]) => Array.isArray(p.run) && p.run.length).map(([key, p]) => ({
          key, name: p.name ?? key, icon: p.icon ?? "icons/agent.svg", tint: p.tint !== false,
          run: p.run, installed: true,
        }));
      } catch {}
    }
    return [];
  }
  merge(known, extras) {
    const byKey = new Map((known ?? []).map(a => [a.key, a]));
    for (const extra of extras) {
      const cur = byKey.get(extra.key);
      byKey.set(extra.key, cur ? { ...cur, name: extra.name ?? cur.name, icon: extra.icon ?? cur.icon, tint: extra.tint, installed: cur.installed || extra.installed } : extra);
    }
    return [...byKey.values()];
  }
  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const installed = this.agents.filter(a => a.installed);
    const choices = installed;
    return v_flex().min_h(0).w_full().h(Math.min(491, 167 + Math.max(1, choices.length + (this.failed ? 1 : 0)) * 31)).bg(t.popover).p(5).text_size(12.8)
      .id("new-menu").track_focus(this.handle)
      .on_key_down((e) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (!agent) return;
        closeOverlay(props().overlay);
        askNew(space, "tab.new", `New ${agent.name} tab`, { name: agent.name, space: space?.id, argv: agent.run });
      })
      .child(this.row("terminal", svg("icons/shell.svg").size(14), "Terminal", () => askNew(space, "tab.new", "New terminal", { space: space?.id }), shortcut("tab.new")))
      .child(div().px(9).pt(8).pb(4).text_size(11).text_color(t.dim).child("Start an agent"))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
        .children(choices.map((a, i) => this.row(a.key, a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14), a.name,
          () => askNew(space, "tab.new", `New ${a.name} tab`, { name: a.name, space: space?.id, argv: a.run }), a.installed ? (i < 9 ? String(i + 1) : "") : "not installed", a.installed)))
        .when(this.failed || this.agents.length === 0, el => el.child(div().px(9).py(6).text_color(t.dim).child(this.failed ? "Could not check installed agents" : "Checking installed agents…"))))
      .child(div().h(1).mx(4).my(5).bg(t.border))
      .child(this.row("space", div().w(14).child("+"), "New space", () => askNew(space, "space.new", "New space", {}), shortcut("space.new")))
      .child(this.row("worktree", svg("mods/workspace-chrome/branch.svg").size(14), "New worktree…", () => openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: { space: space?.id, folder: panes().find(p => p.focused)?.cwd, action: "new" } }), "", Boolean(space)))
      .child(this.row("worktree-open", svg("mods/workspace-chrome/branch.svg").size(14), "Open worktree\u2026", () => openOverlay({ mod: "worktree", kind: "dialog", width: 560, height: 480, props: { space: space?.id, folder: panes().find(p => p.focused)?.cwd, action: "open" } }), "", Boolean(space)));
  }
}
