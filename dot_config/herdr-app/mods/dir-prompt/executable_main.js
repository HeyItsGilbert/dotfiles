// Start a space or tab in a folder you choose, fzf-style: type to filter,
// ↑/↓ to pick, Enter to go. Recent folders: ones picked here, every space's
// folder, and `zoxide query -l` when it's installed. The first row keeps
// Herdr's default (the focused terminal's folder), so Enter at once = today.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { run, props, closeOverlay, theme, exec, checking, home, spaces, panes, shared, setShared, pickFolder } from "herdr";

const RECENT = "dir-prompt.recent";
const ROW_H = 29;
const MAX_ROWS = 60;

// fzf-lite: subsequence, bonuses for consecutive runs and path boundaries.
function score(text, q) {
  const t = text.toLowerCase();
  const query = q.toLowerCase();
  if (!query) return 0;
  let s = 0, ti = 0, prev = -2, first = -1;
  for (const c of query) {
    const i = t.indexOf(c, ti);
    if (i < 0) return null;
    if (i === prev + 1) s += 6;
    if (i === 0 || /[\\/\s._:\-]/.test(t[i - 1])) s += 4;
    s += 1;
    if (first < 0) first = i;
    prev = i;
    ti = i + 1;
  }
  if (t.includes(query)) s += 14;
  return s - first * 0.5 - t.length * 0.01;
}

function short(p) {
  const h = String(home() ?? "").replace(/[\\/]+$/, "");
  const s = String(p ?? "");
  if (h && s.toLowerCase().startsWith(h.toLowerCase())) return "~" + s.slice(h.length);
  return s;
}

export default class DirPrompt extends View {
  init(_props, cx) {
    // Opened by a key (`mod.open`) there are no props: default to a new terminal here.
    const p = props() ?? {};
    if (!p.command) Object.assign(p, { command: "tab.new", args: {}, title: "New terminal", ok: "Start", cwd: panes().find(x => x.focused)?.cwd ?? null });
    this.p = p;
    this.cwd = p.cwd ?? null;
    this.text = "";
    this.at = 0;
    this.all = [];
    this.input = InputState.new({ placeholder: this.cwd ? short(this.cwd) : (p.remote ? "that machine's default" : "current folder") });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", () => this.pick());
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
    this.list = ScrollHandle.new();
    cx.spawn(async cx => this.load(cx));
  }

  // Recent folders: picked here → live spaces on the target machine → zoxide,
  // deduped. Another machine's zoxide database is meaningless here, so skip it.
  async load(cx) {
    if (checking()) return;
    const out = [];
    const seen = new Set();
    const push = (raw) => {
      const p = String(raw ?? "").trim().replace(/[\\/]+$/, "");
      const k = p.toLowerCase();
      if (p && !seen.has(k)) { seen.add(k); out.push(p); }
    };
    for (const d of (shared(RECENT) ?? [])) push(d);
    const sp = spaces();
    const machine = sp.find(x => x.active)?.machine ?? null;
    for (const s of sp) if ((s.machine ?? null) === machine) push(s.folder);
    if (!this.p.remote) {
      try {
        const r = await exec("zoxide", ["query", "-l"], { timeout: 4000 });
        if (r.code === 0) for (const line of String(r.stdout ?? "").split(/\r?\n/)) push(line);
      } catch {}
    }
    this.all = out;
    cx.notify();
  }

  // Rows: with no query, the default folder first; typing filters the recents
  // and offers the exact typed path when nothing matches it.
  candidates() {
    const p = this.p ?? {};
    const text = this.input.value().trim();
    const def = { value: null, label: short(this.cwd ?? "") || (p.remote ? "that machine's default" : "current folder"), sub: "default" };
    if (!text) return [def, ...this.all.map(d => ({ value: d, label: short(d), sub: "" }))].slice(0, MAX_ROWS);
    const ranked = this.all
      .map((d, i) => ({ d, i, s: score(d, text) }))
      .filter(r => r.s !== null)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, MAX_ROWS - 2)
      .map(r => ({ value: r.d, label: short(r.d), sub: "" }));
    const exact = ranked.some(r => r.value.toLowerCase() === text.toLowerCase());
    if (!exact) ranked.push({ value: text, label: short(text), sub: "typed path" });
    return ranked;
  }

  pick() {
    if (this.done) return; // Enter can arrive through the input's submit and the root key handler
    const rows = this.candidates();
    if (!rows.length) return;
    this.done = true;
    const row = rows[Math.min(this.at, rows.length - 1)];
    closeOverlay(props().overlay);
    const { command, args } = this.p ?? {};
    if (!command) return;
    if (row.value) setShared(RECENT, [row.value, ...(shared(RECENT) ?? []).filter(d => d.toLowerCase() !== row.value.toLowerCase())].slice(0, 25));
    run(command, row.value ? { ...(args ?? {}), folder: row.value } : { ...(args ?? {}) });
  }

  browse(cx) {
    if (this.p.remote) return;
    cx.spawn(async cx => {
      const folder = await pickFolder({ prompt: this.p.title ?? "Start in" });
      if (folder) { this.input.set_value(String(folder)); this.text = String(folder); this.at = 0; this.input.focus(); cx.notify(); }
    });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); return; }
    const rows = this.candidates();
    if (e.key === "enter") { this.pick(); cx.stop_propagation(); return; }
    if (e.key === "down" || (e.key === "n" && e.modifiers?.control)) {
      if (rows.length) { this.at = (this.at + 1) % rows.length; this.list.scroll_to_item(this.at); }
    } else if (e.key === "up" || (e.key === "p" && e.modifiers?.control)) {
      if (rows.length) { this.at = (this.at + rows.length - 1) % rows.length; this.list.scroll_to_item(this.at); }
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const t = theme();
    const p = this.p ?? {};
    const rows = this.candidates();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const button = (id, text, primary, action) => h_flex().id(id).h(30).px(12).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12).font_medium().cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("dir-prompt").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().min_h(0).p(16).gap(10).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().flex_none()
        .child(div().flex_1().text_size(14).font_semibold().child((p.title ?? "Start in").replace(/^./, (c) => c.toUpperCase())))
        .child(div().id("dp-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(() => closeOverlay(props().overlay)).child("Esc")))
      .child(h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(this.inputFocused ? t.accent : t.input).bg(t.background)
        .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))
        .when(!p.remote, el => el.child(div().id("dp-browse").px(8).py(3).rounded(6).text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover(s => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.browse(cx)).child("Browse…"))))
      .child(v_flex().id("dp-list").flex_1().min_h(0).overflow_y_scrollbar().gap(1).track_scroll(this.list)
        .children(rows.map((r, i) => h_flex().id(`dp-row-${i}`).h(ROW_H).px(10).gap(8).items_center().rounded(6).flex_none().text_size(12.5)
          .cursor_pointer().when(i === this.at, el => el.bg(t.selected))
          .hover(s => s.bg(t.hover))
          .on_hover((over, cx) => { if (over && this.at !== i) { this.at = i; cx.notify(); } })
          .on_click(() => this.pick())
          .child(div().w(12).flex_none().text_color(i === this.at ? t.accent : t.dim).child(i === this.at ? "▸" : ""))
          .child(div().flex_1().min_w(0).truncate().child(r.label))
          .when(r.sub, el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(r.sub)))))
      .child(h_flex().flex_none().items_center().justify_between().pt(2)
        .child(div().text_size(11).text_color(t.dim).child("type to filter · ↑↓ pick · Enter start"))
        .child(h_flex().gap(8)
          .child(button("dp-cancel", "Cancel", false, () => closeOverlay(props().overlay)))
          .child(button("dp-go", p.ok ?? "Start", true, () => this.pick())))));
  }
}
