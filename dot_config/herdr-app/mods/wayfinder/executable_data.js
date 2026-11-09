import { exec, home, appHome, readTextFile } from "herdr";
import * as fs from "fs/promises";

// Maps and tickets live wherever the caller's repo's issue tracker keeps them; every entry
// point here takes {root, machine} (the active space's live folder + machine, resolved by
// main.js) instead of a fixed path, so Wayfinder follows whichever space is focused — local
// or on another machine (`hc machine ls`). See detectTracker(), which reads
// docs/agents/issue-tracker.md under `root` to find out which backend applies.
const TYPES = new Set(["research", "prototype", "grilling", "task"]);
export const CLOSED = new Set(["resolved", "out-of-scope"]);
// Only research is driven by the agent alone; a task can be either, so it is drawn as HITL.
export const AFK = new Set(["research"]);

// `mtn` is an fnm shim on this machine; herdr's exec doesn't source fnm's per-shell PATH, so
// call it by full path locally. A remote machine isn't assumed to share that quirk — PATH there
// is whatever that machine's shell resolves `mtn` to.
const mtnPath = (machine) => machine ? "mtn" : `${home()}/AppData/Roaming/fnm/node-versions/v24.5.0/installation/mtn.cmd`;

const unquote = (v) => v.replace(/^(["'])(.*)\1$/, "$2");
const str = (v) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const link = (v) => v.match(/^\[\[([^\]|#]+)/)?.[1].trim() ?? null;

/** The YAML subset the vault templates write: scalars, `[]`, `[a, b]` and indented `- item` lists. */
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { props: null, body: text };
  const props = {};
  let list = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && list) { list.push(unquote(item[1].trim())); continue; }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    // An empty value may open a list; a scalar left empty reads as an empty list too.
    if (v === "") props[kv[1]] = list = [];
    else if (/^\[.*\]$/.test(v)) { props[kv[1]] = v.slice(1, -1).split(",").map(s => unquote(s.trim())).filter(Boolean); list = null; }
    else { props[kv[1]] = unquote(v); list = null; }
  }
  return { props, body: text.slice(m[0].length) };
}

const section = (body, name) =>
  body.match(new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"))?.[1].trim() ?? "";

const lines = (r) => r.stdout.split("\n").filter(Boolean);
const json = (r) => JSON.parse(r.stdout || "null");

/**
 * Finishes a backend's raw tickets into derived state: frontier, blocked, claimed, resolved or
 * out-of-scope. Every backend builds `{ name, type, n, status, blockedBy (names) }` and calls this.
 */
function finalize(tickets) {
  const byName = new Map(tickets.map(t => [t.name, t]));
  for (const t of tickets) {
    if (!TYPES.has(t.type)) t.errors.push(`"${t.type}" is not a ticket type`);
    if (!Number.isFinite(t.n)) t.errors.push("no ticket number");
    const missing = t.blockedBy.filter(b => !byName.has(b));
    if (missing.length) t.errors.push(`blocked by: no ticket named ${missing.join(", ")}`);
    // A missing blocker can't be closed, so it keeps blocking.
    t.openBlockers = t.blockedBy.filter(b => !CLOSED.has(byName.get(b)?.status));
    t.state = CLOSED.has(t.status) ? t.status
      : t.status === "claimed" ? "claimed"
      : t.openBlockers.length ? "blocked" : "frontier";
  }
  return tickets.sort((a, b) => (a.n || 0) - (b.n || 0));
}

/** Lists a directory's entries, cross-machine. `fs.readdir` only ever reaches this machine,
 *  and `readTextFile`'s `on` has no directory-listing equivalent, so a remote root asks that
 *  machine's own shell instead. Assumes POSIX there (every core Herdr can `hc run` into is a
 *  real machine's shell, not a watched folder) — fine for the dev boxes/VMs this targets. */
async function listDir(dir, machine) {
  if (!machine) return fs.readdir(dir).catch(() => []);
  const r = await exec("ls", ["-1A", dir], { on: machine }).catch(() => null);
  return r ? lines(r) : [];
}

/** Walks up from `dir` (on `machine`) for docs/agents/issue-tracker.md and reads which tracker
 *  that repo declares. Cached per machine+dir: a repeat visit to the same space skips the walk. */
const trackerCache = new Map();
async function detectTracker(dir, machine) {
  const cacheKey = `${machine ?? ""}:${dir}`;
  if (trackerCache.has(cacheKey)) return trackerCache.get(cacheKey);
  let d = dir;
  for (let i = 0; i < 16 && d; i++) {
    const path = `${d}/docs/agents/issue-tracker.md`;
    const text = await readTextFile(path, { on: machine }).catch(() => null);
    if (text) {
      const title = (text.match(/^#\s*Issue tracker:\s*(.+)$/mi)?.[1] ?? "").toLowerCase();
      const kind = title.includes("github") ? "github"
        : title.includes("gitlab") ? "gitlab"
        : title.includes("tasknotes") ? "tasknotes"
        : "local";
      const result = { kind, root: d };
      trackerCache.set(cacheKey, result);
      return result;
    }
    const parent = d.replace(/[\\/][^\\/]+$/, "");
    if (parent === d) break;
    d = parent;
  }
  // The wayfinder skill defaults to the local-markdown tracker when none is declared.
  const result = { kind: "local", root: dir };
  trackerCache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------------------------
// local: the wayfinder skill's own fallback, `.scratch/<effort>/{map.md,issues/NN-<slug>.md}`,
// plain `Key: value` lines rather than frontmatter (see issue-tracker-local.md).
// ---------------------------------------------------------------------------------------------
const localBackend = {
  async listMaps(root, machine) {
    const dir = `${root}/.scratch`;
    const names = await listDir(dir, machine);
    const maps = await Promise.all(names.map(async (name) => {
      const file = `${dir}/${name}/map.md`;
      const text = await readTextFile(file, { on: machine }).catch(() => null);
      if (!text) return null;
      return { name, folder: `${dir}/${name}`, kind: "local" };
    }));
    return maps.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  },
  async loadTickets(root, map) {
    const machine = map.machine;
    const dir = `${map.folder}/issues`;
    const files = (await listDir(dir, machine)).filter(f => f.endsWith(".md"));
    const field = (head, name) => head.match(new RegExp(`^${name}:\\s*(.*)$`, "mi"))?.[1]?.trim() ?? "";
    const tickets = files.map((f) => {
      const file = `${dir}/${f}`;
      return { file, f };
    });
    const loaded = await Promise.all(tickets.map(async ({ file, f }) => {
      const text = (await readTextFile(file, { on: machine }).catch(() => null)) ?? "";
      const head = text.slice(0, text.indexOf("\n\n") < 0 ? text.length : text.indexOf("\n\n"));
      const status = field(head, "Status").toLowerCase();
      return {
        name: f.replace(/^\d+-/, "").replace(/\.md$/, ""), file,
        type: field(head, "Type").toLowerCase(), tagged: true,
        n: Number(f.match(/^(\d+)-/)?.[1]),
        status: status === "claimed" || status === "resolved" || status === "out-of-scope" ? status : "open",
        claimedBy: "", resolved: "",
        blockedBy: field(head, "Blocked by").split(",").map(s => s.trim()).filter(Boolean),
        question: section(text, "Question"), answer: section(text, "Answer"),
        errors: [],
      };
    }));
    // `Blocked by` lists ticket numbers (NN); resolve to names now that every ticket is loaded.
    const byNum = new Map(loaded.map(t => [String(t.n), t.name]));
    for (const t of loaded) t.blockedBy = t.blockedBy.map(n => byNum.get(n) ?? n);
    return finalize(loaded);
  },
};

// ---------------------------------------------------------------------------------------------
// tasknotes: TaskNotes tasks under TaskNotes/Tasks/, per this vault's issue-tracker.md's
// "Wayfinding operations" section.
// ---------------------------------------------------------------------------------------------
const normTags = (tags) => (tags ?? []).map(t => t.replace(/^wayfinder:/, "wayfinder/"));

const taskNotesBackend = {
  listMaps: (root, machine) => taskNoteMaps(root, machine, "open", false),
  listCompletedMaps: (root, machine) => taskNoteMaps(root, machine, "done", true),
  async loadTickets(root, map) {
    const machine = map.machine, mtn = mtnPath(machine);
    const wheres = [`projects.contains("[[${map.name}]]")`, `wayfinderMap == "[[${map.name}]]"`];
    const rowLists = await Promise.all(wheres.flatMap(where =>
      ["open", "in-progress", "done"].map(status =>
        exec(mtn, ["-p", root, "list", "--where", where, "--status", status, "--json"], { on: machine }).then(r => json(r) ?? []))));
    // Only tasks actually charted as tickets (a wayfinder/<type> tag): a plain task that
    // merely shares this PRD's `projects:` link for feature grouping isn't a map node.
    const rows = [...new Map(rowLists.flat().map(r => [r.path, r])).values()];
    const loaded = await Promise.all(rows.map(async (row) => {
      const text = (await readTextFile(`${root}/${row.path}`, { on: machine }).catch(() => null)) ?? "";
      const { body } = parseFrontmatter(text);
      const tags = normTags(row.tags);
      // A real wayfinder/<type> tag picks the icon; a plain project-linked task (no such
      // tag) still shows up — charted as a generic task — but `tagged: false` lets the UI
      // filter down to only the formally-tracked decision/handoff tickets.
      const typeTag = tags.find(t => t.startsWith("wayfinder/") && t !== "wayfinder/map" && t !== "wayfinder/out-of-scope");
      const type = typeTag?.slice("wayfinder/".length) ?? "task";
      const tagged = !!typeTag || tags.includes("wayfinder/out-of-scope");
      const status = tags.includes("wayfinder/out-of-scope") ? "out-of-scope"
        : row.status === "done" ? "resolved"
        : row.status === "in-progress" ? "claimed"
        : "open";
      return {
        name: row.title, file: `${root}/${row.path}`,
        type, n: 0, status, dateCreated: row.dateCreated ?? "", tagged,
        // No separate assignee field is kept in practice; a claimed ticket's session is
        // assumed to run in a tab named after the ticket, same as Start names its tab.
        claimedBy: row.claimedBy || row.title, resolved: row.completedDate ?? "",
        blockedBy: (row.blockedBy ?? []).map(link).filter(Boolean),
        question: section(body, "Question"), answer: section(body, "Answer"),
        errors: [],
      };
    }));
    // Map order follows creation order (the skill's "first by dateCreated wins").
    loaded.sort((a, b) => a.dateCreated.localeCompare(b.dateCreated));
    loaded.forEach((t, i) => { t.n = i + 1; });
    return finalize(loaded);
  },
};

/** PRD-note maps under projects/: tagged wayfinder:map/wayfinder/map, open or closed per `done`. */
async function listPrdMaps(root, machine, done) {
  const dir = `${root}/projects`;
  const files = (await listDir(dir, machine)).filter(f => f.endsWith(".md"));
  const out = await Promise.all(files.map(async (f) => {
    const text = (await readTextFile(`${dir}/${f}`, { on: machine }).catch(() => null)) ?? "";
    const { props } = parseFrontmatter(text);
    if (!props) return null;
    const tags = normTags(props.tags);
    if (!tags.includes("wayfinder/map")) return null;
    const status = (props.Status ?? props.status ?? "").toLowerCase();
    const closed = status === "complete" || status === "done" || status === "resolved";
    return closed === done ? f.slice(0, -3) : null;
  }));
  return out.filter(Boolean);
}

/** A map is either a TaskNote tagged wayfinder:map/wayfinder/map under TaskNotes/Tasks/
 * (tickets point back via `wayfinderMap:`), or a PRD note under projects/ carrying the
 * same tag (tickets point back via `projects:`). Both are in live use in this vault. */
async function taskNoteMaps(root, machine, taskStatus, prdDone) {
  const mtn = mtnPath(machine);
  const [colon, slash, prd] = await Promise.all([
    exec(mtn, ["-p", root, "list", "--tag", "wayfinder:map", "--status", taskStatus, "--json"], { on: machine }).then(r => json(r) ?? []),
    exec(mtn, ["-p", root, "list", "--tag", "wayfinder/map", "--status", taskStatus, "--json"], { on: machine }).then(r => json(r) ?? []),
    listPrdMaps(root, machine, prdDone),
  ]);
  const names = new Set();
  const maps = [];
  for (const row of [...colon, ...slash]) if (!names.has(row.title)) { names.add(row.title); maps.push({ name: row.title }); }
  for (const name of prd) if (!names.has(name)) { names.add(name); maps.push({ name }); }
  return maps.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// github: a `wayfinder:map`-labelled issue with native GitHub sub-issues as tickets, per
// issue-tracker-github.md. `gh` infers the repo from the working directory.
// ---------------------------------------------------------------------------------------------
const githubBackend = {
  async listMaps(root, machine) {
    const r = await exec("gh", ["issue", "list", "--state", "open", "--label", "wayfinder:map", "--json", "number,title"], { cwd: root, on: machine });
    const rows = json(r) ?? [];
    return rows.map(row => ({ name: row.title, kind: "github", number: row.number })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async loadTickets(root, map) {
    const machine = map.machine;
    const sub = await exec("gh", ["issue", "view", String(map.number), "--json", "subIssues", "--jq", ".subIssues.nodes[].number"], { cwd: root, on: machine });
    const numbers = lines(sub);
    const fields = "number,title,url,body,state,closed,labels,assignees,blockedBy,comments";
    const shape = "{number,title,url,body,closed,labels:[.labels[].name],assignees:[.assignees[].login],blockedBy:[.blockedBy.nodes[].number],comments:[.comments[].body]}";
    const rows = await Promise.all(numbers.map(n =>
      exec("gh", ["issue", "view", n, "--json", fields, "--jq", shape], { cwd: root, on: machine }).then(r => json(r))));
    const byNumber = new Map(rows.map(row => [row.number, row]));
    const loaded = rows.map(row => {
      const type = row.labels.find(l => l.startsWith("wayfinder:"))?.slice("wayfinder:".length) ?? "";
      const status = row.closed ? "resolved" : row.assignees.length ? "claimed" : "open";
      return {
        name: row.title, url: row.url,
        type, n: row.number, status, tagged: true,
        claimedBy: row.assignees[0] ?? "", resolved: row.closed ? "closed" : "",
        blockedBy: row.blockedBy.map(n => byNumber.get(n)?.title ?? `#${n}`),
        question: row.body.replace(/^Part of #\d+\n+/, "").trim(),
        answer: row.closed ? (row.comments.at(-1) ?? "") : "",
        errors: [],
      };
    });
    return finalize(loaded);
  },
};

// ---------------------------------------------------------------------------------------------
// gitlab: a `wayfinder:map`-labelled issue with `relates_to`-linked issues as tickets, per
// issue-tracker-gitlab.md. `glab` infers the project from the working directory.
// ---------------------------------------------------------------------------------------------
const gitlabBackend = {
  async listMaps(root, machine) {
    const r = await exec("glab", ["issue", "list", "--label", "wayfinder:map", "-F", "json"], { cwd: root, on: machine });
    const rows = json(r) ?? [];
    return rows.map(row => ({ name: row.title, kind: "gitlab", iid: row.iid })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async loadTickets(root, map) {
    const machine = map.machine;
    const links = await exec("glab", ["api", `projects/:id/issues/${map.iid}/links`], { cwd: root, on: machine });
    const children = (json(links) ?? []).filter(l => (l.labels ?? []).some(x => x.startsWith("wayfinder:")));
    const rows = await Promise.all(children.map(c =>
      exec("glab", ["api", `projects/:id/issues/${c.iid}`], { cwd: root, on: machine }).then(r => json(r))));
    const byIid = new Map(rows.map(row => [row.iid, row]));
    const blockers = await Promise.all(rows.map(row =>
      exec("glab", ["api", `projects/:id/issues/${row.iid}/links`], { cwd: root, on: machine })
        .then(r => (json(r) ?? []).filter(l => l.link_type === "blocks").map(l => l.iid))));
    const loaded = rows.map((row, i) => {
      const labels = row.labels ?? [];
      const type = labels.find(l => l.startsWith("wayfinder:"))?.slice("wayfinder:".length) ?? "";
      const status = row.state === "closed" ? "resolved" : row.assignees?.length ? "claimed" : "open";
      return {
        name: row.title, url: row.web_url,
        type, n: row.iid, status, tagged: true,
        claimedBy: row.assignees?.[0]?.username ?? "", resolved: row.state === "closed" ? "closed" : "",
        blockedBy: blockers[i].map(n => byIid.get(n)?.title ?? `#${n}`),
        question: (row.description ?? "").replace(/^Part of #\d+\n+/, "").trim(),
        answer: "",
        errors: [],
      };
    });
    return finalize(loaded);
  },
};

const BACKENDS = { local: localBackend, tasknotes: taskNotesBackend, github: githubBackend, gitlab: gitlabBackend };

/** Active maps for `root`'s tracker (on `machine`, null for this one), by name. */
export async function listMaps(root, machine) {
  const { kind, root: detected } = await detectTracker(root, machine);
  const maps = await BACKENDS[kind].listMaps(detected, machine);
  return maps.map(m => ({ ...m, kind, root: detected, machine }));
}

/** Completed maps for `root`'s tracker — previously finished projects to jump back to. */
export async function listCompletedMaps(root, machine) {
  const { kind, root: detected } = await detectTracker(root, machine);
  const backend = BACKENDS[kind];
  if (!backend.listCompletedMaps) return [];
  const maps = await backend.listCompletedMaps(detected, machine);
  return maps.map(m => ({ ...m, kind, root: detected, machine }));
}

/** The map's tickets with their derived state: frontier, blocked, claimed, resolved or out-of-scope. */
export async function loadTickets(map) {
  return BACKENDS[map.kind].loadTickets(map.root, map);
}

const NODE_W = 168;
const LINE_H = 15;
const CHARS = 23;

/** Word-wraps a label to at most three lines of the node's width. */
export function wrap(text) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > CHARS && line) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > 3) return [...lines.slice(0, 2), lines.slice(2).join(" ")];
  return lines;
}

const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i); return (h >>> 0).toString(36); };
const quote = (s) => `"${s.replace(/["\\]/g, "\\$&")}"`;

/**
 * Lays the tickets out with Graphviz. Herdr can't draw lines, so dot draws only the edges into an SVG
 * (nodes invisible) and returns each node's box in the same pixels; the mod draws the nodes over it.
 * One graph point is one logical pixel. Always local: this renders into the app's own window,
 * regardless of which machine the ticket data came from.
 */
export async function layoutGraph(tickets, edgeColor) {
  const shown = new Set(tickets.map(t => t.name));
  const ids = new Map(tickets.map((t, i) => [t.name, `n${i}`]));
  const size = (t) => 16 + wrap(`${t.n}  ${t.name}`).length * LINE_H;
  const dot = [
    "digraph {",
    `graph [rankdir=LR, bgcolor="transparent", pad=0.1, nodesep=0.12, ranksep=0.45];`,
    `node [shape=box, fixedsize=true, style=invis, label="", width=${NODE_W / 72}];`,
    `edge [color=${quote(edgeColor)}, arrowsize=0.6, penwidth=1.1];`,
    ...tickets.map(t => `${ids.get(t.name)} [height=${size(t) / 72}];`),
    ...tickets.flatMap(t => t.blockedBy.filter(b => shown.has(b)).map(b => `${ids.get(b)} -> ${ids.get(t.name)};`)),
    "}",
  ].join("\n");
  const key = hash(dot);
  const dir = `${appHome()}/mods/wayfinder/.cache`;
  // Hidden, so writing here doesn't reload the mod; older renders go first.
  await fs.mkdir(dir, { recursive: true });
  const stale = (await fs.readdir(dir).catch(() => [])).filter(f => !f.startsWith(key));
  await Promise.all(stale.map(f => fs.unlink(`${dir}/${f}`).catch(() => {})));
  const dotFile = `${dir}/${key}.dot`;
  await fs.writeFile(dotFile, dot, "utf8");
  const r = await exec("dot", ["-Tsvg", "-o", `${dir}/${key}.svg`, "-Tjson", "-o", `${dir}/${key}.json`, dotFile]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `dot exited ${r.code}`);
  const graph = JSON.parse((await readTextFile(`${dir}/${key}.json`)) ?? "{}");
  const [, , bbW, bbH] = graph.bb.split(",").map(Number);
  const PAD = 7.2;
  const nodes = new Map();
  for (const o of graph.objects ?? []) {
    const t = tickets[Number(o.name.slice(1))];
    const [x, y] = o.pos.split(",").map(Number);
    const w = Number(o.width) * 72, h = Number(o.height) * 72;
    nodes.set(t.name, { x: PAD + x - w / 2, y: PAD + bbH - y - h / 2, w, h });
  }
  return { svg: `mods/wayfinder/.cache/${key}.svg`, width: bbW + 2 * PAD, height: bbH + 2 * PAD, nodes };
}
