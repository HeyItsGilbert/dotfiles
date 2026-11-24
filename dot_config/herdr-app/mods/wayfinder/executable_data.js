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

// Machine- and tracker-specific values (a Jira project + its bridge script, the `mtn` CLI's
// full path, the harness Start launches) live in a `wayfinder.json` at the tracker repo's root,
// read by detectTracker() and carried on every map as `map.cfg`. Nothing here hardcodes them.
// A version-managed `mtn` shim may not resolve in herdr's exec PATH, so `mtn` in the repo's
// wayfinder.json can name its full path (local machine only; remote machines resolve `mtn`
// from that machine's PATH).
const mtnPath = (machine, cfg) => machine ? "mtn" : String(expandHome(cfg?.mtn) ?? "mtn");

const unquote = (v) => v.replace(/^(["'])(.*)\1$/, "$2");
const str = (v) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const link = (v) => v.match(/^\[\[([^\]|#]+)/)?.[1].trim() ?? null;

/** Ticket types are spelled three ways across trackers — bare (`research`), the skill's colon
 *  form (`wayfinder:research`), and Jira-style hyphen labels (`wayfinder-research`). Same type;
 *  strip any wayfinder prefix so TYPES, AFK and the icons see the bare word everywhere. */
const normType = (v) => String(v ?? "").trim().toLowerCase().replace(/^wayfinder[-:/]\s*/, "");

/** Any wayfinder-scoped label/tag, in whichever prefix spelling the tracker uses. */
const isWayfinderLabel = (v) => /^wayfinder[-:/]/i.test(String(v ?? "").trim());

/** Tracker status words (`closed`, `done`, `in-progress`, …) → the four states finalize knows. */
function normStatus(v) {
  const s = String(v ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  if (/^(done|closed|resolved|complete|cancelled|canceled|won.t-do)$/.test(s)) return "resolved";
  if (/^(claimed|in-progress|doing|active|assigned)$/.test(s)) return "claimed";
  if (/^out-of-scope$/.test(s)) return "out-of-scope";
  return "open";
}

/** The YAML subset the note templates write: scalars, `[]`, `[a, b]` and indented `- item` lists. */
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
 * out-of-scope. Every backend builds `{ name, type, n, status, blockedBy (names), externalBlockers? }`
 * and calls this. A backend whose blocker edges may point outside the charted set (jira links are
 * org-wide) counts those itself and sets `externalBlockers`; missing names are real data errors
 * only for trackers whose blockers are all in-map (local, github, gitlab).
 */
function finalize(tickets) {
  const byName = new Map(tickets.map(t => [t.name, t]));
  for (const t of tickets) {
    // An unknown type only matters on a live ticket — a closed one with a stale or foreign
    // label is history, not a broken node, so it must not ring red forever.
    if (!TYPES.has(t.type) && !CLOSED.has(t.status)) t.errors.push(`"${t.type}" is not a ticket type`);
    if (!Number.isFinite(t.n)) t.errors.push("no ticket number");
    const missing = t.blockedBy.filter(b => !byName.has(b));
    if (missing.length && !t.externalBlockers) t.errors.push(`blocked by: no ticket named ${missing.join(", ")}`);
    // A missing blocker can't be closed, so it keeps blocking; an external (off-map) open
    // blocker blocks too, and the sheet counts them so the node can say why.
    t.openBlockers = t.blockedBy.filter(b => !CLOSED.has(byName.get(b)?.status));
    t.blockedByExternal = Math.max(0, Number(t.externalBlockers) || 0);
    t.state = CLOSED.has(t.status) ? t.status
      : t.status === "claimed" ? "claimed"
      : (t.openBlockers.length + t.blockedByExternal) ? "blocked" : "frontier";
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
 *  that repo declares. The declared tracker is primary; local `.scratch/` maps are always merged
 *  as well, so a Jira/GitHub repo still shows personal wayfinding maps kept outside the team
 *  tracker (the wayfinder skill's own fallback).
 *  At the same root the optional `wayfinder.json` is read: the repo's config for this mod
 *  (`jira: {project, bridge}`, `mtn`, `harness`). A leading `~/` in `mtn` or `jira.bridge`
 *  means the reader's home; a relative `jira.bridge` resolves under the root. Cached per
 *  machine+dir. */
const trackerCache = new Map();
const expandHome = (p) => typeof p === "string" && p.startsWith("~/") ? `${home()}/${p.slice(2)}` : p;
async function repoConfig(root, machine) {
  const text = await readTextFile(`${root}/wayfinder.json`, { on: machine }).catch(() => null);
  if (!text) return {};
  try { return JSON.parse(text) ?? {}; } catch { return {}; }
}
async function detectTracker(dir, machine) {
  const cacheKey = `${machine ?? ""}:${dir}`;
  if (trackerCache.has(cacheKey)) return trackerCache.get(cacheKey);
  let d = dir;
  for (let i = 0; i < 16 && d; i++) {
    const path = `${d}/docs/agents/issue-tracker.md`;
    const text = await readTextFile(path, { on: machine }).catch(() => null);
    if (text) {
      const title = (text.match(/^#\s*Issue tracker:\s*(.+)$/mi)?.[1] ?? "").toLowerCase();
      const declared = title.includes("github") ? "github"
        : title.includes("gitlab") ? "gitlab"
        : title.includes("jira") ? "jira"
        : title.includes("tasknotes") ? "tasknotes"
        : null;
      const kinds = declared && declared !== "local" ? [declared, "local"] : ["local"];
      const cfg = await repoConfig(d, machine);
      const result = { kind: declared ?? "local", kinds, root: d, cfg };
      trackerCache.set(cacheKey, result);
      return result;
    }
    const parent = d.replace(/[\\/][^\\/]+$/, "");
    if (parent === d) break;
    d = parent;
  }
  // The wayfinder skill defaults to the local-markdown tracker when none is declared.
  const cfg = await repoConfig(dir, machine);
  const result = { kind: "local", kinds: ["local"], root: dir, cfg };
  trackerCache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------------------------
// local: the wayfinder skill's own fallback, `.scratch/<effort>/{map.md,issues/NN-<slug>.md}`,
// plain `Key: value` lines rather than frontmatter (see issue-tracker-local.md). A map closes
// with a `Status:` line in its map file (`Status: closed (destination reached YYYY-MM-DD)`),
// matching how trackers already annotate finished maps; none means the map is open.
// ---------------------------------------------------------------------------------------------

/** A local map is closed when its head-block `Status:` line says so: `closed`, `done`,
 *  `complete`… anything else (or no line) keeps it in the active list. */
function localMapDone(text) {
  // Only the head block (before the first section) carries map metadata; a "Status:" line in
  // the body is prose, not the marker.
  const si = text.search(/^## /m);
  const head = text.slice(0, si < 0 ? text.length : si);
  const m = head.match(/^status:\s*(.+)$/mi);
  return !!m && normStatus(m[1].split(/[\s(]/)[0]) === "resolved";
}

async function allLocalMaps(root, machine) {
  const dir = `${root}/.scratch`;
  const names = await listDir(dir, machine);
  const maps = await Promise.all(names.map(async (name) => {
    const folder = `${dir}/${name}`;
    // Windows' FS is case-blind but a remote POSIX one isn't; try both spellings of the map file.
    const text = (await readTextFile(`${folder}/map.md`, { on: machine }).catch(() => null))
      ?? (await readTextFile(`${folder}/MAP.md`, { on: machine }).catch(() => null));
    if (!text) return null;
    return { name, folder, kind: "local", done: localMapDone(text) };
  }));
  return maps.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

const localBackend = {
  async listMaps(root, machine) {
    return (await allLocalMaps(root, machine)).filter(m => !m.done);
  },
  async listCompletedMaps(root, machine) {
    return (await allLocalMaps(root, machine)).filter(m => m.done);
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
      // The fields may ride as a `Key: value` head block (the wayfinder skill's local form) or
      // as YAML frontmatter (the TaskNotes templates). parseFrontmatter() accepts both: no `---`
      // fence returns props:null and the whole file as body, so the head-block path still runs.
      const { props, body } = parseFrontmatter(text);
      // Head fields live at the very top of the body, before the first blank line; the title
      // sits on the same block now that frontmatter is gone, so read to the first `## ` heading
      // instead — a blank line between title and `Type:` no longer truncates the head.
      const head = props ? "" : body.slice(0, body.search(/^## /m) < 0 ? body.length : body.search(/^## /m));
      const prop = (k) => str(props?.[k]);
      const status = normStatus(props ? prop("status") : field(head, "Status"));
      const closed = CLOSED.has(status);
      return {
        name: f.replace(/^\d+-/, "").replace(/\.md$/, ""), file,
        type: normType(props ? prop("type") : field(head, "Type")), tagged: true,
        n: Number(f.match(/^(\d+)-/)?.[1]),
        status,
        claimedBy: prop("assignee") || field(head, "Claimed by"),
        resolved: closed ? prop("completedDate") || prop("closedDate") : "",
        blockedBy: (props ? (Array.isArray(props.blocked_by) ? props.blocked_by : props.blocked_by ? [props.blocked_by] : []) : field(head, "Blocked by").split(","))
          .map(s => String(s).trim()).filter(Boolean),
        question: section(body, "Question"), answer: section(body, "Answer") || section(body, "Resolution"),
        errors: [],
      };
    }));
    // `Blocked by` lists ticket numbers (NN or NN-slug.md). Resolve to names now that every ticket
    // is loaded; the file-form token is stripped to its number so both spellings match.
    const byNum = new Map(loaded.map(t => [String(t.n), t.name]));
    const num = (tok) => tok.match(/^0*(\d+)/)?.[1] ?? tok;
    for (const t of loaded) t.blockedBy = t.blockedBy.map(n => byNum.get(num(n)) ?? n);
    return finalize(loaded);
  },
};

// ---------------------------------------------------------------------------------------------
// tasknotes: TaskNotes tasks under TaskNotes/Tasks/, per the tracker repo's issue-tracker.md
// "Wayfinding operations" section.
// ---------------------------------------------------------------------------------------------
const normTags = (tags) => (tags ?? []).map(t => t.replace(/^wayfinder[:\-/]/, "wayfinder/"));

const taskNotesBackend = {
  listMaps: (root, machine, cfg) => taskNoteMaps(root, machine, cfg, "open", false),
  listCompletedMaps: (root, machine, cfg) => taskNoteMaps(root, machine, cfg, "done", true),
  async loadTickets(root, map) {
    const machine = map.machine, mtn = mtnPath(machine, map.cfg);
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
 * same tag (tickets point back via `projects:`). Both forms are read. */
async function taskNoteMaps(root, machine, cfg, taskStatus, prdDone) {
  const mtn = mtnPath(machine, cfg);
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
      const type = row.labels.map(normType).find(v => TYPES.has(v)) ?? "";
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
    const children = (json(links) ?? []).filter(l => (l.labels ?? []).some(isWayfinderLabel));
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

// ---------------------------------------------------------------------------------------------
// jira: an issue labelled `wayfinder-map` with Epic-Link/parent children as tickets, per the
// tracker repo's issue-tracker.md "Wayfinding operations". Mods have no HTTP, so a Jira tracker
// reads through a bridge script named by the repo's wayfinder.json (`jira.bridge`, relative to
// the root or `~`-expanded; its credentials live in the script, never here). A remote machine
// needs the same repo checked out there; `pwsh` is assumed on PATH.
// ---------------------------------------------------------------------------------------------
const jiraBackend = {
  async runScript(root, machine, cfg, args) {
    const j = cfg?.jira ?? {};
    if (!j.project) throw new Error("wayfinder.json: jira.project is not set");
    if (!j.bridge) throw new Error("wayfinder.json: jira.bridge is not set");
    const bridge = /^(?:\/|[A-Za-z]:[\\/]|~[\\/])/.test(j.bridge)
      ? expandHome(j.bridge) : `${root}/${j.bridge}`;
    const r = await exec("pwsh", ["-NoProfile", "-NonInteractive", "-File", bridge, "-Project", String(j.project), ...args],
      { cwd: root, on: machine, timeout: 90000 });
    if (r.code !== 0) throw new Error((r.stderr || r.stdout || `the Jira bridge script exited ${r.code}`).trim());
    const out = JSON.parse(r.stdout || "null");
    if (!out) throw new Error("the Jira bridge script returned no JSON");
    return out;
  },
  async listMaps(root, machine, cfg) {
    const { maps } = await this.runScript(root, machine, cfg, ["-ListMaps"]);
    return maps.map(m => ({ name: m.name, key: m.key, url: m.url, status: m.status }));
  },
  async listCompletedMaps(root, machine, cfg) {
    const { maps } = await this.runScript(root, machine, cfg, ["-ListMaps", "-Done"]);
    return maps.map(m => ({ name: m.name, key: m.key, url: m.url, status: m.status }));
  },
  async loadTickets(root, map) {
    const { tickets } = await this.runScript(root, map.machine, map.cfg, ["-Map", map.key]);
    // Jira wiki markup: h2. headings → ## so section() finds Question; the pane renders both as markdown.
    const wiki = (s) => String(s ?? "").replace(/^h([1-6])\.\s+/gm, (_, n) => "#".repeat(+n) + " ");
    const loaded = tickets.map(row => ({
      name: row.name, url: row.url, key: row.key,
      type: normType(row.type), n: row.n, status: normStatus(row.status), tagged: true,
      // The pane matches a claimed ticket to its session by tab name, and sessions are named
      // after the ticket — the Jira assignee (a username) would never match.
      claimedBy: row.name, resolved: row.resolved ?? "",
      blockedBy: (row.blockedBy ?? []).map(str).filter(Boolean),
      externalBlockers: Number(row.blockedOutside) || 0,
      question: section(wiki(row.question), "Question"), answer: section(wiki(row.answer), "Answer"),
      errors: [],
    }));
    return finalize(loaded);
  },
};

const BACKENDS = { local: localBackend, tasknotes: taskNotesBackend, github: githubBackend, gitlab: gitlabBackend, jira: jiraBackend };

/** Maps from every tracker this repo uses — the declared one plus local `.scratch/`. A failing
 *  source (Jira down, credentials locked) contributes nothing rather than hiding the others, but
 *  its reason rides on the returned list as `.sourceErrors` so the UI can say why a tracker's
 *  maps are missing instead of silently showing fewer. */
async function mapsFromKinds(root, machine, method) {
  const { kinds, cfg } = await detectTracker(root, machine);
  const sourceErrors = [];
  const lists = await Promise.all(kinds.map(async (kind) => {
    const backend = BACKENDS[kind];
    if (!backend[method]) return [];
    try { return await backend[method](root, machine, cfg); }
    catch (e) { if (method === "listMaps") sourceErrors.push({ kind, message: String(e?.message ?? e) }); return []; }
  }));
  const seen = new Set();
  const maps = [];
  lists.forEach((list, i) => { for (const m of list) {
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    maps.push({ ...m, kind: m.kind ?? kinds[i], root, machine, cfg });
  } });
  if (sourceErrors.length) maps.sourceErrors = sourceErrors;
  return maps.sort((a, b) => a.name.localeCompare(b.name));
}

/** Active maps for `root`'s tracker (on `machine`, null for this one), by name. */
export async function listMaps(root, machine) {
  return mapsFromKinds(root, machine, "listMaps");
}

/** Completed maps for `root`'s tracker — previously finished projects to jump back to. */
export async function listCompletedMaps(root, machine) {
  return mapsFromKinds(root, machine, "listCompletedMaps");
}

/** The map's tickets with their derived state: frontier, blocked, claimed, resolved or out-of-scope. */
export async function loadTickets(map) {
  return BACKENDS[map.kind].loadTickets(map.root, map);
}

/**
 * How the Start / Restart buttons name a map and a ticket, per tracker kind — one config table.
 * The launched `/skill:wayfinder` session resolves each reference through its own tracker, so a
 * Jira pair rides as jira:// keys (the session reads the epic and the ticket straight from Jira)
 * and GitHub as issue:// numbers (the omp reader opens the issue in its repo); note-resident
 * maps keep [[wikilinks]]. Add or edit a kind's row to change what Start does for that type.
 */
const LAUNCH = {
  local: (map, t) => [`[[${map.name}]]`, `[[${t.name}]]`],
  tasknotes: (map, t) => [`[[${map.name}]]`, `[[${t.name}]]`],
  jira: (map, t) => [`jira://${map.key}`, t.key ? `jira://${t.key}` : `[[${t.name}]]`],
  github: (map, t) => [`issue://${map.number}`, `issue://${t.n}`],
  gitlab: (map, t) => [`#${map.iid}`, `#${t.n}`],
};

/** The program Start / Restart launch a session with: `harness` in the repo's wayfinder.json —
 *  a string for every map kind, or a table keyed by kind with a `default` row. Without config,
 *  "omp". */
export function launchAgent(map) {
  const h = map.cfg?.harness;
  if (typeof h === "string") return h;
  return h?.[map.kind] ?? h?.default ?? "omp";
}

/** The prompt the Start / Restart buttons hand to the new session for this map + ticket. */
export function launchPrompt(map, ticket) {
  const refs = (LAUNCH[map.kind] ?? LAUNCH.local)(map, ticket).filter(Boolean).join(" ");
  return `/skill:wayfinder ${refs}`;
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
