import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { agents, spaces, panes, focused, run, theme, props, shared, setShared, openOverlay, closeOverlay, watchFolder, exec } from "herdr";
import { AFK, listMaps, listCompletedMaps, loadTickets, layoutGraph, wrap } from "./data.js";

const ZOOM_MIN = 0.3, ZOOM_MAX = 2.5;

const tint = (color, alpha) => /^#[0-9a-f]{6}$/i.test(color ?? "") ? color + alpha : color;
const stop = (_e, cx) => cx.stop_propagation();
// Obsidian links read as their names; the markdown view would show the brackets.
const unlink = (md) => md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, name, alias) => alias ?? name);

/** The focused space's repo: its first terminal's live folder (the convention other mods
 *  follow — see AGENTS.md's "the default mods take a space's repo from its first terminal"),
 *  falling back to the space's creation folder if it has no terminal yet. `machine` is null
 *  for this computer, else a name from `hc machine ls` — Wayfinder follows whichever space
 *  is shown, local or remote, rather than one fixed vault. */
function activeRepo() {
  const space = spaces().find(s => s.active);
  if (!space) return null;
  const tabIds = new Set(space.tabs.map(t => t.id));
  const first = panes().find(p => p.terminal && tabIds.has(p.tab));
  return { root: first?.cwd || space.folder, machine: space.machine };
}

// Shared keys are per repo (machine+root), so the selected map and the picker's map-list
// cache don't bleed between spaces pointed at different projects.
const repoKey = (prefix, repo) => `${prefix}.${repo.machine ?? "local"}:${repo.root}`;

/** Named tabs by name: a ticket's claimed_by is the claiming session's tab name, bare or as "<space> / <tab>". */
function tabsByName() {
  const out = new Map();
  for (const s of spaces()) for (const tab of s.tabs) if (tab.named) {
    const info = { ...tab, space: s.id };
    out.set(tab.name, info);
    out.set(`${s.name} / ${tab.name}`, info);
  }
  return out;
}

/** What a ticket looks like now, joined with the live session its claim or launch names. */
function look(ticket, tabs, t) {
  const tab = tabs.get(ticket.state === "claimed" ? ticket.claimedBy : ticket.name);
  const live = ticket.state === "claimed" || (ticket.state === "frontier" && tab);
  if (ticket.state === "claimed" && !tab) return { label: "Stale claim", border: t.blocked, fill: "#00000000", text: t.foreground, dashed: true };
  if (live) {
    // A session that stopped working with its ticket unresolved is most likely waiting on a reply.
    const status = tab.status ?? "idle", attention = status !== "working";
    const c = attention ? (status === "blocked" ? t.blocked : t.ansi6) : t[status];
    const label = attention ? `Needs you · ${status}` : ticket.state === "claimed" ? `In progress · ${status}` : "Starting";
    return { label, border: c, fill: tint(c, "2e"), text: t.foreground, tab, attention };
  }
  if (ticket.state === "frontier") return { label: "Frontier", border: t.accent, fill: tint(t.accent, "26"), text: t.foreground };
  if (ticket.state === "blocked") return { label: "Blocked", border: t.dim, fill: "#00000000", text: t.muted };
  // Resolved reads as done but recedes: the theme's green, faded.
  const green = t.ansi2;
  return { label: `Resolved ${ticket.resolved}`.trim(), color: green, border: tint(green, "59"), fill: tint(green, "14"), text: t.muted, resolved: true };
}

export default class Wayfinder extends View {
  init(_props, cx) {
    if (props()?.picker) {
      const { root, machine } = props();
      this.pickerRoot = root;
      this.pickerMachine = machine ?? null;
      const cached = root ? shared(repoKey("wayfinder.mapsCache", { root, machine: this.pickerMachine })) : null;
      if (cached) { this.pickerMaps = cached.active; this.pickerCompletedMaps = cached.completed; }
      else { this.pickerLoading = true; cx.spawn((cx) => this.fetchMaps(cx)); }
      return;
    }
    this.focus = cx.focus_handle();
    this.tickets = [];
    this.selected = null;
    this.wayfinderOnly = false;
    this.size = { width: 368, height: 600 };
    this.view = { x: 0, y: 0, z: 1 };
    this.repo = activeRepo();
    cx.spawn(async (cx) => {
      await this.reload(cx);
      for (;;) {
        const repo = this.repo;
        // No remote folder-watch API, so a remote repo polls instead; no active space is rare
        // (space just closed) and also falls back to a short poll rather than spinning.
        if (!repo) await new Promise(r => setTimeout(r, 5000));
        else if (repo.machine) await new Promise(r => setTimeout(r, 30000));
        else await watchFolder(repo.root);
        await this.reload(cx);
      }
    });
  }

  // Loads the picker's project list and refreshes the shared cache; called on a cold
  // cache and by the refresh button. Keeps whatever's already shown while it runs.
  async fetchMaps(cx) {
    this.pickerRefreshing = true;
    cx.notify();
    try {
      if (!this.pickerRoot) throw new Error("No active space");
      const [active, completed] = await Promise.all([
        listMaps(this.pickerRoot, this.pickerMachine),
        listCompletedMaps(this.pickerRoot, this.pickerMachine),
      ]);
      this.pickerMaps = active;
      this.pickerCompletedMaps = completed;
      this.pickerError = null;
      setShared(repoKey("wayfinder.mapsCache", { root: this.pickerRoot, machine: this.pickerMachine }), { active, completed });
    } catch (e) {
      if (!this.pickerMaps) this.pickerError = String(e);
    }
    this.pickerLoading = false;
    this.pickerRefreshing = false;
    cx.notify();
  }

  async reload(cx) {
    try {
      const repo = this.repo = activeRepo();
      if (!repo) {
        this.maps = []; this.map = null; this.tickets = []; this.error = null;
        this.graphKey = null; cx.notify(); return;
      }
      this.maps = await listMaps(repo.root, repo.machine);
      const want = shared(repoKey("wayfinder.map", repo)), prev = this.map?.file;
      this.map = this.maps.find(m => m.name === want) ?? this.maps[0] ?? null;
      if (this.map?.file !== prev) this.view = { x: 0, y: 0, z: 1 };
      this.tickets = this.map ? (await loadTickets(this.map)).filter(t => t.state !== "out-of-scope") : [];
      this.error = null;
    } catch (e) {
      this.error = /\brg\b/.test(String(e)) ? "Install ripgrep: brew install ripgrep" : String(e);
    }
    this.graphKey = null;
    cx.notify();
  }

  // dot's render depends on the tickets and the edge color, so a theme switch redraws the edges too.
  ensureGraph(cx, t, tickets) {
    const key = `${this.map?.file}|${tickets.map(x => `${x.name}<${x.blockedBy.join(",")}`).join("|")}|${t.dim}`;
    if (key === this.graphKey) return;
    this.graphKey = key;
    cx.spawn(async (cx) => {
      try {
        const graph = await layoutGraph(tickets, t.dim);
        if (this.graphKey === key) { this.graph = graph; this.graphError = null; }
      } catch (e) {
        this.graphError = /not found|No such file|ENOENT|dot: command/.test(String(e)) ? "Install Graphviz: brew install graphviz" : String(e);
      }
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    if (props()?.picker) return this.renderPicker(t);
    // The active space changed repo, or the picker switched maps within this one: reload.
    const repo = activeRepo();
    const repoChanged = repo && (repo.root !== this.repo?.root || repo.machine !== this.repo?.machine);
    const want = repo ? shared(repoKey("wayfinder.map", repo)) : null;
    const mapChanged = !repoChanged && this.map && want !== this.map.name && this.maps?.some(m => m.name === want);
    if ((repoChanged || mapChanged) && !this.switching) {
      this.switching = true;
      cx.spawn(async (cx) => { this.selected = null; await this.reload(cx); this.switching = false; });
    }
    const tickets = this.wayfinderOnly ? this.tickets.filter(x => x.tagged) : this.tickets;
    if (this.map && !this.error) this.ensureGraph(cx, t, tickets);
    const tabs = tabsByName();
    const looks = new Map(tickets.map(x => [x.name, look(x, tabs, t)]));
    return v_flex().id("wayfinder").size_full().min_w(0).bg(t.surface).text_color(t.foreground)
      .track_focus(this.focus)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.selected) this.selected = null;
        else if (e.keystroke === "cmd-=" || e.keystroke === "cmd-+") this.zoomAt(this.view.z * 1.25);
        else if (e.keystroke === "cmd--") this.zoomAt(this.view.z / 1.25);
        else if (e.keystroke === "cmd-0") this.zoomAt(1);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .child(this.renderHeader(t, looks, tickets))
      .child(this.renderBody(t, looks, tickets));
  }

  renderHeader(t, looks, tickets) {
    const count = (pred) => tickets.filter(pred).length;
    const resolved = count(x => x.state === "resolved");
    const progress = count(x => x.state === "claimed");
    const frontier = count(x => x.state === "frontier");
    const waiting = tickets.filter(x => looks.get(x.name)?.attention);
    const hidden = this.wayfinderOnly ? this.tickets.length - tickets.length : 0;
    // Each count in its nodes' color, so the row doubles as the legend.
    const legend = (id, color, text, icon) => h_flex().id(id).flex_none().gap(4).items_center().h(18).px(5).rounded(4)
      .bg(tint(color, "26")).text_color(color)
      .when(icon, el => el.child(svg(`mods/wayfinder/icons/${icon}.svg`).size(11).text_color(color))).child(text);
    return v_flex().flex_none().px(10).py(8).gap(4).border_b(1).border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(h_flex().id("map-picker").h(24).px(8).min_w(0).items_center().rounded(6).cursor_pointer()
          .text_size(12).text_color(t.foreground).font_semibold().truncate().hover(s => s.bg(t.hover))
          .on_mouse_down("left", stop)
          .on_click(() => openOverlay({ mod: "wayfinder", props: { picker: true, root: this.repo?.root, machine: this.repo?.machine }, kind: "popup", width: 280, height: 420 }))
          .child(`${this.map?.name ?? "No map"}${this.repo?.machine ? ` · ${this.repo.machine}` : ""}  ▾`))
        .child(div().flex_1())
        .child(h_flex().id("tag-filter").flex_none().h(20).px(7).gap(4).items_center().rounded(5).cursor_pointer()
          .text_size(11).bg(this.wayfinderOnly ? tint(t.accent, "26") : t.hover).text_color(this.wayfinderOnly ? t.accent : t.muted)
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.wayfinderOnly = !this.wayfinderOnly; this.selected = null; cx.notify(); })
          .child(this.wayfinderOnly ? `Tagged only (${hidden} hidden)` : "All linked tasks")))
      .when(this.map, el => el.child(h_flex().px(8).gap(5).items_center().flex_wrap().text_size(11)
        .when(waiting.length, el => el.child(legend("needs-you", t.ansi6, `${waiting.length} need${waiting.length === 1 ? "s" : ""} you`, "attention")
          .font_semibold().cursor_pointer().hover(s => s.bg(tint(t.ansi6, "40")))
          .on_mouse_down("left", stop).on_click((_e, cx) => { this.reveal(waiting); cx.notify(); })))
        .child(legend("legend-progress", t.working, `${progress} in progress`))
        .child(legend("legend-frontier", t.accent, `${frontier} frontier`))
        .child(legend("legend-resolved", t.ansi2, `${resolved} resolved`))
        .child(div().flex_1())
        .child(this.renderZoom(t).text_color(t.muted))));
  }

  // Click the percentage to return to 100%.
  renderZoom(t) {
    const step = (id, label, z) => div().id(id).px(5).rounded(4).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click((_e, cx) => { this.zoomAt(z); cx.notify(); }).child(label);
    return h_flex().flex_none().items_center().gap(1)
      .child(step("zoom-out", "−", this.view.z / 1.25))
      .child(step("zoom-reset", `${Math.round(this.view.z * 100)}%`, 1).min_w(36).flex().justify_center())
      .child(step("zoom-in", "+", this.view.z * 1.25));
  }

  renderBody(t, looks, tickets) {
    const notice = (text) => div().p(16).text_size(12.5).text_color(t.muted).child(text);
    if (this.error) return notice(this.error);
    if (this.maps && !this.map) return notice("No active wayfinder maps");
    if (this.graphError) return notice(this.graphError);
    const g = this.graph;
    if (!g) return notice("Loading…");
    const z = this.view.z;
    const nodes = tickets.filter(x => g.nodes.has(x.name)).map(x => {
      const box = g.nodes.get(x.name), l = looks.get(x.name), sel = this.selected === x.name;
      return div().id(`node-${x.name}`).absolute().left(box.x * z).top(box.y * z).w(box.w * z).h(box.h * z)
        .px(8 * z).flex().flex_col().justify_center().rounded((AFK.has(x.type) ? 10 : 3) * z)
        .border(x.errors.length || sel ? 2 : 1).border_color(x.errors.length ? t.blocked : sel ? t.foreground : l.border)
        .when(l.dashed, el => el.border_dashed()).bg(l.fill).cursor_pointer()
        .hover(s => s.bg(tint(l.border, "40")))
        .on_click((_e, cx) => { if (this.dragged) return; this.selected = sel ? null : x.name; this.focus.focus(); cx.notify(); })
        .children(wrap(`${x.n}  ${x.name}`).map(line =>
          div().text_size(12 * z).text_color(l.text).whitespace_nowrap().child(line)))
        .when(l.resolved, el => el.child(svg("mods/wayfinder/icons/check.svg").absolute().top(5 * z).right(6 * z).size(11 * z).text_color(l.color)))
        // Every live session pulses; one waiting on you also rings.
        .when(l.tab, el => el.child(div().absolute().top(-5 * z).left(-5 * z).right(-5 * z).bottom(-5 * z).rounded(((AFK.has(x.type) ? 10 : 3) + 5) * z)
          .border(2).border_color(l.border).loop("opacity", { from: 0.15, to: 1, period: 1400 })))
        .when(l.attention, el => el.child(svg("mods/wayfinder/icons/attention.svg").absolute().top(5 * z).right(6 * z).size(12 * z).text_color(l.border)));
    });
    const sheetH = Math.round(this.size.height * 0.55);
    this.extent = { width: g.width * z, height: g.height * z + (this.selected ? sheetH : 0) };
    this.clampView();
    // Our own viewport, not overflow_scroll: its trackpad panning snaps to one axis, and mods get no
    // pinch event. So two-finger scroll pans both axes, cmd/ctrl+scroll zooms, and a drag pans.
    return div().id("body").relative().flex_1().min_h(0).w_full()
      .child(div().id("graph").size_full().relative().overflow_hidden()
        .when(this.drag?.moved, el => el.cursor_grabbing())
        .on_size_change((size, cx) => { this.viewport = size; cx.notify(); })
        .on_scroll_wheel((e, cx) => {
          if (e.modifiers.platform || e.modifiers.control) this.zoomAt(this.view.z * Math.exp(-e.delta.y / 200), e.local_position);
          else { this.view.x -= e.delta.x; this.view.y -= e.delta.y; }
          cx.notify();
        })
        .on_mouse_down("left", (e) => { this.dragged = false; this.drag = { px: e.position.x, py: e.position.y, x: this.view.x, y: this.view.y }; })
        .on_mouse_move((e, cx) => {
          const d = this.drag;
          if (!d) return;
          const dx = e.position.x - d.px, dy = e.position.y - d.py;
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          d.moved = this.dragged = true;
          this.view.x = d.x - dx;
          this.view.y = d.y - dy;
          cx.notify();
        })
        .on_mouse_up("left", (_e, cx) => { this.drag = null; cx.notify(); })
        // A release outside the map never arrives; leaving it ends the drag.
        .on_hover((hovered, cx) => { if (!hovered && this.drag) { this.drag = null; cx.notify(); } })
        .child(div().absolute().left(-this.view.x).top(-this.view.y).w(this.extent.width).h(this.extent.height)
          .child(image(g.svg).absolute().left(0).top(0).w(g.width * z).h(g.height * z))
          .children(nodes)))
      .when(this.selected, el => el.child(this.renderSheet(t, looks, sheetH)));
  }

  // Selects the waiting ticket after the selected one, and scrolls it into the middle.
  reveal(waiting) {
    const i = waiting.findIndex(x => x.name === this.selected);
    const x = waiting[(i + 1) % waiting.length], box = this.graph?.nodes.get(x.name);
    this.selected = x.name;
    if (!box) return;
    const vp = this.viewport ?? this.size, z = this.view.z;
    this.view.x = (box.x + box.w / 2) * z - vp.width / 2;
    this.view.y = (box.y + box.h / 2) * z - vp.height / 4;
  }

  clampView() {
    const v = this.view, vp = this.viewport ?? this.size, e = this.extent;
    if (!e) return;
    v.x = Math.max(0, Math.min(v.x, e.width - vp.width));
    v.y = Math.max(0, Math.min(v.y, e.height - vp.height));
  }

  // Keeps the map point under `at` (viewport px; the centre by default) still while the scale changes.
  zoomAt(z, at) {
    const v = this.view, vp = this.viewport ?? this.size;
    const p = at ?? { x: vp.width / 2, y: vp.height / 2 };
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    v.x = (v.x + p.x) / v.z * next - p.x;
    v.y = (v.y + p.y) / v.z * next - p.y;
    v.z = next;
  }

  renderSheet(t, looks, height) {
    const x = this.tickets.find(y => y.name === this.selected);
    if (!x) return div();
    const l = looks.get(x.name);
    const icon = (name, color, size = 12) => svg(`mods/wayfinder/icons/${name}.svg`).size(size).flex_none().text_color(color);
    const chip = (name, text, color) => h_flex().h(20).px(7).gap(4).items_center().rounded(5)
      .bg(tint(color ?? t.muted, "1f")).text_size(11).text_color(color ?? t.muted)
      .when(name, el => el.child(icon(name, color ?? t.muted, 11))).child(text);
    const label = (name, text) => h_flex().gap(5).items_center().text_size(11).font_semibold().text_color(t.muted)
      .child(icon(name, t.muted, 11)).child(text);
    const action = (id, name, text, primary, onClick) => {
      const fg = primary ? t.solid_foreground : t.foreground;
      return h_flex().id(id).h(26).px(10).gap(6).items_center().rounded(6).text_size(12)
        .bg(primary ? t.solid : t.raised).text_color(fg)
        .hover(s => s.bg(primary ? tint(t.solid, "d9") : t.hover)).cursor_pointer().on_mouse_down("left", stop).on_click(onClick)
        .child(icon(name, fg, 11)).child(text);
    };
    const agent = l.tab && agents().find(a => a.tab === l.tab.id);
    const start = () => {
      const f = focused();
      run("tab.new", { name: x.name, space: f?.space, folder: f?.cwd ?? undefined, argv: ["omp", `/skill:wayfinder [[${this.map.name}]] [[${x.name}]]`] });
    };
    // A stale claim has no live tab; relaunch one named after the claim so the ticket reads live again.
    const restart = () => {
      const f = focused();
      run("tab.new", { name: x.claimedBy || x.name, space: f?.space, folder: f?.cwd ?? undefined, argv: ["omp", `/skill:wayfinder [[${this.map.name}]] [[${x.name}]]`] });
    };
    const markdown = (id, name, title, text) => v_flex().gap(5)
      .child(label(name, title))
      .child(TextView.markdown(id, unlink(text)).text_size(12.5).selectable());
    // Each name selects that ticket; the dot is its node's color.
    const relations = (id, name, title, names) => v_flex().flex_1().min_w(0).gap(4)
      .child(label(name, title))
      .when(!names.length, el => el.child(div().text_size(12).text_color(t.dim).child("None")))
      .children(names.map(b => {
        const bl = looks.get(b);
        return h_flex().id(`${id}-${b}`).min_w(0).gap(6).items_center().text_size(12).cursor_pointer()
          .hover(s => s.text_color(t.accent)).on_click((_e, cx) => { if (bl) { this.selected = b; cx.notify(); } })
          .child(div().size(6).rounded(6).flex_none().bg(bl?.border ?? t.blocked)).child(div().min_w(0).truncate().child(b));
      }));
    const blocks = this.tickets.filter(y => y.blockedBy.includes(x.name)).map(y => y.name);
    // Sized to the ticket, up to `height`; only a longer one scrolls.
    return v_flex().id("sheet").absolute().left(0).right(0).bottom(0).max_h(height)
      .bg(t.popover).border_t(1).border_color(t.border).shadow_md()
      .on_mouse_down("left", stop).on_scroll_wheel((_e, cx) => cx.stop_propagation())
      .child(h_flex().flex_none().px(12).pt(10).pb(8).gap(8).items_center()
        .child(div().px(5).rounded(4).bg(t.raised).text_size(11).text_color(t.muted).flex_none().child(String(x.n)))
        .child(div().flex_1().min_w(0).text_size(13.5).font_semibold().truncate().child(x.name))
        .child(h_flex().id("sheet-copy").size(20).flex_none().items_center().justify_center().rounded(5)
          .hover(s => s.bg(t.hover)).cursor_pointer().tooltip("Copy name")
          .on_click((_e, cx) => {
            cx.write_to_clipboard(x.name);
            this.copied = x.name;
            cx.notify();
            cx.spawn(async cx => { await cx.sleep(1500); if (this.copied === x.name) { this.copied = null; cx.notify(); } });
          })
          .child(this.copied === x.name ? icon("check", t.ansi2, 13) : icon("copy", t.muted, 13)))
        .child(h_flex().id("sheet-close").size(20).flex_none().items_center().justify_center().rounded(5)
          .hover(s => s.bg(t.hover)).cursor_pointer()
          .on_click((_e, cx) => { this.selected = null; cx.notify(); }).child(icon("close", t.muted, 13))))
      .child(h_flex().flex_none().px(12).pb(10).gap(5).flex_wrap()
        .child(chip(x.type, x.type || "untyped"))
        .child(chip(AFK.has(x.type) ? "afk" : "hitl", AFK.has(x.type) ? "AFK" : "HITL"))
        .child(chip(l.resolved ? "check" : l.attention ? "attention" : null, l.label, l.color ?? l.border)))
      .child(v_flex().id("sheet-body").flex_none().h(Math.min(this.contentH ?? 0, Math.max(80, height - 120))).overflow_y_scrollbar()
        .child(v_flex().id("sheet-content").px(12).gap(12)
        .on_size_change((size, cx) => { if (size.height !== this.contentH) { this.contentH = size.height; cx.notify(); } })
        .children(x.errors.map(e => h_flex().gap(6).items_center().text_size(12).text_color(t.blocked).child(icon("alert", t.blocked)).child(e)))
        .child(h_flex().gap(12).items_start().p(8).rounded(6).bg(t.raised)
          .child(relations("blocked-by", "lock", "Blocked by", x.blockedBy))
          .child(div().w(1).self_stretch().bg(t.border))
          .child(relations("blocks", "unlock", "Blocks", blocks)))
        .when(x.question, el => el.child(markdown("question", "question", "Question", x.question)))
        .when(x.answer, el => el.child(markdown("answer", "answer", "Answer", x.answer)))
        .child(div().h(2))))
      .child(h_flex().flex_none().px(12).py(9).gap(6).border_t(1).border_color(t.border)
        .when(x.state === "frontier" && !l.tab, el => el.child(action("start", "start", "Start", true, start)))
        .when(l.dashed, el => el.child(action("restart", "start", "Restart", true, restart)))
        .when(agent, el => el.child(action("go", "session", "Go to session", true, () => run("agent.focus", { terminal: agent.address }))))
        .when(!!x.file, el => el.child(action("obsidian", "open", "Open in Obsidian", false, () => exec("open", [`obsidian://open?path=${encodeURIComponent(x.file)}`]))))
        .when(!x.file && !!x.url, el => el.child(action("issue", "open", "Open issue", false, () => exec("open", [x.url])))));
  }

  renderPicker(t) {
    const repo = this.pickerRoot ? { root: this.pickerRoot, machine: this.pickerMachine } : null;
    const current = repo ? shared(repoKey("wayfinder.map", repo)) : null;
    const notice = (text) => div().px(8).py(4).text_size(12).text_color(t.muted).child(text);
    if (this.pickerLoading && !this.pickerMaps) return v_flex().id("picker").size_full().p(6).bg(t.popover).child(notice("Loading…"));
    if (this.pickerError && !this.pickerMaps) return v_flex().id("picker").size_full().p(6).bg(t.popover).child(notice(this.pickerError));
    const row = (m) => h_flex().id(`map-${m.name}`).h(28).px(8).items_center().rounded(6)
      .text_size(12.5).bg(m.name === current ? t.selected : t.popover).hover(s => s.bg(t.hover)).cursor_pointer()
      .on_click(() => { setShared(repoKey("wayfinder.map", repo), m.name); closeOverlay(props().overlay); }).child(m.name);
    const heading = (text) => div().px(8).py(4).text_size(11).text_color(t.muted).child(text);
    const active = this.pickerMaps ?? [], completed = this.pickerCompletedMaps ?? [];
    const refresh = h_flex().id("picker-refresh").flex_none().w(20).h(20).items_center().justify_center()
      .rounded(4).cursor_pointer().text_size(12).text_color(this.pickerRefreshing ? t.accent : t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { if (!this.pickerRefreshing) cx.spawn((cx) => this.fetchMaps(cx)); })
      .child("⟳");
    return v_flex().id("picker").size_full().p(6).gap(2).bg(t.popover).overflow_y_scroll()
      .child(h_flex().items_center().child(heading("Active maps")).child(div().flex_1()).child(refresh))
      .children(active.map(row))
      .when(active.length === 0, el => el.child(notice("None")))
      .when(completed.length > 0, el => el.child(heading("Completed maps")).children(completed.map(row)));
  }
}
