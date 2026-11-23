// Adapted from Herdr's agents and herdr-space-groups' grouped sidebar.
// Native/OMP child agents and task phases share default-expanded detail sections.
// Attribution and license: NOTICE and LICENSE-APACHE.
// Agents in grouped, folder or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, readTextFile, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout } from "herdr";
import { ObserverReader, POLL_MS, observerTree } from "./observer.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

const MOD = "omp-agents";

// The groups the space-groups mod keeps, each machine's depth first as its sidebar
// shows them, named by their path; none when it isn't installed.
function folders() {
  const raw = shared("space-groups") ?? {};
  const list = (Array.isArray(raw.groups) ? raw.groups : []).filter((g) => typeof g?.id === "string" && typeof g?.name === "string");
  const machine = (g) => g.machine ?? null;
  const byId = new Map(list.map((g) => [g.id, g]));
  const parentOf = (g) => {
    const p = byId.get(g.parent);
    return p && machine(p) === machine(g) ? p : null;
  };
  const placed = new Set();
  const walk = (m, parent, names) => list
    .filter((g) => machine(g) === m && !placed.has(g.id) && (parentOf(g)?.id ?? null) === parent)
    .flatMap((g) => {
      placed.add(g.id);
      const label = [...names, g.name];
      return [{ ...g, label: label.join(" / ") }, ...walk(m, g.id, label)];
    });
  const ordered = [...new Set([null, ...list.map(machine).filter(Boolean).sort()])].flatMap((m) => walk(m, null, []));
  const of = new Map(spaces().map((s) => {
    const g = ordered.find((g) => g.id === raw.spaces?.[s.id] && machine(g) === (s.machine ?? null));
    return [s.id, g ?? null];
  }));
  return { ordered, of };
}

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function lead(tab, all = panes()) {
  const mine = all.filter(p => p.tab === tab.id && p.terminal);
  return mine.find(p => p.program?.agent) ?? mine.find(p => p.focused) ?? mine[0];
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return tab.name === prog && telling ? live : tab.name;
}
// An omp terminal's title is `π <state> <session>`: the brand, a state separator
// (`>` idle, `!` needs-input, a braille spinner frame or static `:` while working;
// Herdr strips the frame, so it can be absent), then the session title omp itself
// sets (generated or `/rename`, which carries its own nerd-font icon). The name is
// everything after the brand and separator.
const ompSession = (s) => ((s ?? "").match(/^π[\s\u2800-\u28FF:>!]+(.+)$/) ?? [])[1]?.trim() || null;

// Shorten a session name to what its row doesn't already say: drop the leading
// nerd-font glyph, and a `CODE:` prefix when the space or tab carries that code.
// The tooltip and screen-reader label keep the full name.
const trimSession = (s, a) => {
  let t = (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const m = t.match(/^([\p{Lu}][\p{L}\p{N}_-]*):\s+(.+)$/u);
  const ctx = `${a.space_name ?? ""} ${a.tab_name ?? ""}`.toLowerCase();
  if (m && ctx.includes(m[1].toLowerCase())) t = m[2];
  return t;
};

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const ompRoot = (a, terminal) => Boolean(terminal?.labels?.["omp.observer"]) || a.app === "omp" || a.report?.app === "omp" || a.program?.key === "omp";
// Completed OMP work is retained, but never promotes its working parent to Done.
const ompStatus = (child) => child.status === "running" ? "working" : child.status === "failed" ? "blocked" : "idle";

const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
  { id: "folder", label: "Grouped by folder", icon: "folder" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    // Global hide/show of agent detail sections, per kind; kept across restarts.
    this.show = { children: true, tasks: true };
    try { Object.assign(this.show, JSON.parse(localStorage.getItem("show") ?? "{}")); } catch { /* defaults */ }
    if (typeof this.show.children !== "boolean") this.show.children = true;
    if (typeof this.show.tasks !== "boolean") this.show.tasks = true;
    this.observer = new ObserverReader(readTextFile, terminals);
    cx.spawn(async (cx) => { if (await this.observer.poll()) cx.notify(); });
    cx.timer.every(POLL_MS, async (cx) => { if (await this.observer.poll()) cx.notify(); });
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  setPins(pins) {
    this.pins = pins;
    localStorage.setItem("pins", JSON.stringify(pins));
  }

  // Drops pins of agents that ended. Only for machines the list has heard from:
  // right after a start, or while a machine connects, its agents aren't listed yet.
  prunePins(all) {
    const machine = (addr) => (addr.includes("/") ? addr.split("/")[0] : "");
    const heard = new Set(all.map((k) => machine(k.address)));
    const live = new Set(all.filter((k) => k.state === "live").map((k) => k.address));
    const kept = this.pins.filter((p) => !heard.has(machine(p)) || live.has(p));
    if (kept.length !== this.pins.length) this.setPins(kept);
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Native terminals keep their real addresses. Each terminal's OMP namespace
  // contributes children beneath that terminal, including native hc descendants.
  tree(all, addr, seen = new Set()) {
    if (seen.has(addr)) return [];
    seen.add(addr);
    const observation = this.observer.get(addr);
    const omp = observerTree(observation.visibleSnapshot).map(({ child }) => ({ child, owner: addr, state: observation.state }));
    const kids = all.filter(k => k.parent === addr && k.state === "live" && !seen.has(k.address));
    return [...kids.flatMap(k => [
      { t: k },
      ...this.tree(all, k.address, seen),
      ...(ompRoot(k, k) ? [{ footer: k.address }] : []),
    ]), ...omp];
  }

  toggleFold(key, cx) {
    this.folded.has(key) ? this.folded.delete(key) : this.folded.add(key);
    cx.notify();
  }

  childState(row) {
    if (row.child) return row.state !== "live" && row.child.status === "running" ? "idle" : row.child.status;
    const state = this.listed.get(row.t.address) ?? row.t.status;
    return state === "working" ? "running" : state === "done" ? "completed" : state === "error" ? "failed" : state ?? "idle";
  }

  stateIcon(t, state, live = true) {
    if ((state === "running" || state === "in_progress") && live)
      return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    const color = state === "failed" || state === "blocked" ? t.blocked : state === "completed" ? t.done : t.dim;
    const mark = state === "completed" ? "✓" : state === "failed" || state === "blocked" ? "!" :
      state === "aborted" || state === "abandoned" ? "–" : state === "pending" ? "□" :
      state === "running" || state === "in_progress" ? "◷" : "○";
    return div().w(12).flex_none().text_center().text_color(color).child(mark);
  }

  sectionHeader(t, key, label, description = label) {
    const open = !this.folded.has(key);
    return h_flex().id(`section-${key}`).px(8).h(28).flex_none().min_w(0).gap(6).items_center()
      .bg(t.surface)
      .text_size(11.5).font_semibold().text_color(t.muted).cursor_pointer()
      .role("button").accessibility_label(`${open ? "Collapse" : "Expand"} ${label}`)
      .tooltip(`${description}; ${open ? "Collapse" : "Expand"}`)
      .hover(el => el.bg(t.hover).text_color(t.foreground))
      .on_click((_event, cx) => { cx.stop_propagation(); this.toggleFold(key, cx); })
      .child(div().flex_1().min_w(0).truncate().child(label))
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none());
  }

  detailSection(t, key, label, content, description = label) {
    return v_flex().id(`detail-${key}`).min_w(0).flex_none().mt(6).mb(4)
      .border(1).border_color(t.border).rounded(6).overflow_hidden()
      .child(this.sectionHeader(t, key, label, description))
      .when(!this.folded.has(key), el => el.child(
        v_flex().id(`detail-body-${key}`).min_w(0).flex_none().py(4)
          .border_t(1).border_color(t.border).children(content)));
  }

  childRow(t, id, name, state, description, selected = false, action = null, live = true) {
    return h_flex().id(id).px(8).h(26).flex_none().min_w(0).gap(8).items_center().rounded(8).text_size(12.5)
      .tooltip(description).accessibility_label(description)
      .when(selected, el => el.bg(t.raised))
      .when(Boolean(action), el => el.cursor_pointer().hover(s => s.bg(t.hover)).on_click(action))
      .child(div().flex_1().min_w(0).truncate().text_color(selected ? t.foreground : t.muted).child(name))
      .child(this.stateIcon(t, state, live));
  }

  subRow(t, row, shown) {
    const k = row.t;
    const state = this.childState(row);
    const name = k.name || k.template || k.program?.name || k.address;
    return this.childRow(t, `sub-${k.address}`, name, state, `${name}; ${state}; ${k.address}`,
      k.address === shown, () => this.peek(k.address));
  }

  ompRow(t, address, row, state) {
    const child = row.child;
    const status = `${child.status}${state === "live" ? "" : state === "closed" ? " at close" : ` · ${state}`}`;
    const description = `${child.id} (${child.agent}): ${child.task || child.id}; ${status}${child.model ? `; ${child.model}` : ""}`;
    return this.childRow(t, `omp-sub-${address}-${child.id}`, child.id, child.status, description, false, null, state === "live");
  }

  todoRows(t, address, observation) {
    const { snapshot, state } = observation;
    const live = state === "live";
    const rows = [];
    // A session without todos yet simply draws no section; the row stands alone.
    if (!snapshot || snapshot.todos.length === 0) return rows;
    if (!live) rows.push(div().px(8).pb(4).text_size(11).text_color(t.dim)
      .child(state === "closed" ? "Last known TODO · session closed" : "Last known TODO · stale"));
    snapshot.todos.forEach((phase, phaseIndex) => {
      const key = `phase-${address}-${phaseIndex}-${phase.name}`;
      const content = [];
      if (!this.folded.has(key)) {
        phase.tasks.forEach((task, taskIndex) => {
          const label = task.status === "in_progress" ? "In progress" : task.status === "pending" ? "Pending" :
            task.status === "completed" ? "Completed" : task.status === "blocked" ? "Blocked" : "Abandoned";
          const description = `${task.content}; ${label}${!live && task.status === "in_progress" ? " (last known)" : ""}${task.blocker ? `: ${task.blocker}` : ""}`;
          content.push(h_flex().id(`omp-task-${address}-${phaseIndex}-${taskIndex}`)
            .px(8).h(26).flex_none().min_w(0).gap(8).items_center().text_size(11.5)
            .accessibility_label(description).tooltip(task.content)
            .child(div().flex_1().min_w(0).truncate()
              .text_color(task.status === "completed" || task.status === "abandoned" ? t.dim : t.muted)
              .when(task.status === "completed", el => el.line_through()).child(task.content))
            .child(this.stateIcon(t, task.status, live)));
        });
      }
      rows.push(this.detailSection(t, key, phase.name || "Unnamed phase", content, `${address} · ${phase.name || "Unnamed phase"}`));
    });
    return rows;
  }

  observerDetails(t, address) {
    const observation = this.observer.get(address);
    const note = observation.snapshot && observation.state !== "live"
      ? [div().id(`omp-observer-state-${address}`).px(8).py(3).text_size(10.5).text_color(t.dim)
        .accessibility_label(`OMP observer ${observation.state}`)
        .tooltip(observation.state === "stale" ? "No OMP heartbeat for more than 35 seconds; showing last known state" :
          observation.state === "closed" ? "OMP session closed; showing recorded outcomes" : "OMP snapshot missing, invalid, or machine unavailable")
        .child(`OMP · ${observation.state === "closed" ? "session closed" : observation.state}`)]
      : [];
    return [...note, ...this.todoRows(t, address, observation)];
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  // A pane-header show/hide toggle for a detail kind; dim while hidden,
  // bright when the sections show.
  headerToggle(id, icon, on, label, toggle) {
    const t = theme();
    return div()
      .id(id)
      .p(3)
      .rounded(5)
      .cursor_pointer()
      .flex_none()
      .opacity(on ? 1 : 0.45)
      .text_color(on ? t.muted : t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground).opacity(1))
      .accessibility_label(`${label}: ${on ? "shown" : "hidden"}`)
      .tooltip(`${label}: ${on ? "shown — click to hide" : "hidden — click to show"}`)
      .on_click((_e, cx) => { toggle(); cx.notify(); })
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(13));
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.observer.sync(all);
    const byAddress = new Map(all.map(terminal => [terminal.address, terminal]));
    const isOmp = a => ompRoot(a, byAddress.get(a.address));
    const shown = focused()?.agent;
    const trees = new Map(list.map(a => [a.address, this.tree(all, a.address)]));
    const rowStatus = s => s.child
      ? s.state === "live" ? ompStatus(s.child) : "idle"
      : kidStatus(s.t, this.listed);
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a),
      ...trees.get(a.address).filter(s => !s.footer).map(s => RANK[rowStatus(s)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const byFolder = sort.id === "folder";
    const { ordered, of } = folders();
    const folderOf = (a) => of.get(a.space) ?? null;
    const place = (a) => (folderOf(a) ? ordered.indexOf(folderOf(a)) : ordered.length);
    if (byFolder) list = [...list].sort((x, y) => place(x) - place(y));
    this.prunePins(all);
    const pinned = this.pins.map((p) => list.find((a) => a.address === p)).filter(Boolean);
    const rest = list.filter((a) => !this.pins.includes(a.address));
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const branches = trees.get(a.address);
      const subs = this.show.children ? branches.filter(s => !s.footer) : [];
      const owners = [...new Set([...(isOmp(a) ? [a.address] : []), ...branches.filter(s => s.footer).map(s => s.footer)])];
      const taskOwners = this.show.tasks ? owners : [];
      const taskCount = this.show.tasks ? owners.reduce((total, owner) => total + (this.observer.get(owner).snapshot?.todos.reduce((n, phase) => n + phase.tasks.length, 0) ?? 0), 0) : 0;
      const r = row(a, i, subs, taskCount, subs.length > 0 || taskOwners.length > 0);
      if (collapsed || this.folded.has(a.address)) return [r];
      const details = [];
      if (subs.length) {
        const key = `children-${a.address}`;
        const content = this.folded.has(key) ? [] : subs.map(s => s.child ? this.ompRow(t, s.owner, s, s.state) : this.subRow(t, s, shown));
        details.push(this.detailSection(t, key, "Child agents", content));
      }
      for (const owner of taskOwners) details.push(...this.observerDetails(t, owner));
      return [r, ...details];
    };

    // One root control hides or restores both child agents and task sections.
    const fold = (a, subs, taskCount) => {
      const sts = subs.map(rowStatus);
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .accessibility_label(`${open ? "Hide" : "Show"} child agents and tasks`)
        .tooltip(`${open ? "Hide" : "Show"} child agents and tasks; ${subs.length} child agents, ${taskCount} tasks`)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.toggleFold(a.address, cx);
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length + taskCount)));
    };

    // A row reads "space · detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same. An omp session's name (generated or /rename)
    // rides under it on its own line, the row's full width.
    const tabs = spaces().flatMap(s => s.tabs);
    const sessionOf = (a) => (isOmp(a) && ompSession(a.title)) || null;
    const label = (a) => {
      const tab = tabs.find(tab => tab.id === a.tab);
      return tab ? title(tab, lead(tab)) : a.title || a.program?.name || "";
    };
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs, taskCount, hasDetails) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .when(hasDetails, el => el.child(fold(a, subs, taskCount)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = this.pins.includes(a.address);
      const sess = sessionOf(a);
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.setPins(isPinned ? this.pins.filter((p) => p !== a.address) : [...this.pins, a.address]);
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, folder, pinned) the row names its space.
      const full = byPriority || byFolder || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .py(Boolean(sess) ? 4 : 0)
        .min_h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(hasDetails, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.toggleFold(a.address, cx);
          })).child(pic)))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().min_w(0).gap(5).items_center()
            .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
            .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
          // The session gets the row's whole width and wraps rather than clipping.
          .when(Boolean(sess), el => el.child(div().flex_1().min_w(0).text_size(11.5).text_color(idle ? t.dim : t.muted)
            .accessibility_label(sess).tooltip(sess).child(trimSession(sess, a)))))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(hasDetails, el => el.child(fold(a, subs, taskCount)))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped), folders, or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    const anyFolder = rest.some(folderOf);
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const f = folderOf(a);
      const id = byPriority ? `sec-${r}` : byFolder ? `fd-${f?.id ?? ""}` : `sp-${a.space}`;
      const label = byPriority ? SECTION[r] : byFolder ? f?.label ?? "No folder" : a.space_name || "";
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label, status: byPriority ? SECTION_STATUS[r] : null, members: [a], bare: byFolder && !anyFolder });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [...(g.bare ? [] : [header(g)]), ...(this.folded.has(g.id) && !g.bare ? [] : g.members.flatMap(withKids))]);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(h_flex().gap(2).items_center()
              .child(this.headerToggle("ag-show-children", "layers", this.show.children, "Child agents",
                () => { this.show.children = !this.show.children; localStorage.setItem("show", JSON.stringify(this.show)); }))
              .child(this.headerToggle("ag-show-tasks", "check", this.show.tasks, "Tasks",
                () => { this.show.tasks = !this.show.tasks; localStorage.setItem("show", JSON.stringify(this.show)); }))
              .child(
                div()
                  .id("ag-sort")
                  .text_size(11)
                  .text_color(t.dim)
                  .hover((s) => s.text_color(t.foreground))
                  .on_click(() => openOverlay({ mod: MOD, kind: "popup", width: 200, height: 171, props: { sortMenu: true } }))
                  .tooltip(`Sort agents: ${sort.label}`)
                  .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
              ))
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .child(
        h_flex()
          .h(28)
          .px(12)
          .items_center()
          .justify_end()
          .when(collapsed, (el) => el.justify_center().px(0))
          .child(
            div()
              .id("collapse")
              .text_size(13)
              .text_color(t.dim)
              .hover((s) => s.text_color(t.foreground))
              .on_click(toggleSidebar)
              .child(collapsed ? "»" : ""),
          ),
      );
  }
}
