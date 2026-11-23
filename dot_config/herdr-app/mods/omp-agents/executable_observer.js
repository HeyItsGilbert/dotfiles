// Pure snapshot boundaries; the view supplies Herdr's machine-aware file reader.
export const POLL_MS = 1500;
export const STALE_MS = 35000;
const CHILD_STATUSES = new Set(["running", "completed", "failed", "aborted", "idle"]);
const TODO_STATUSES = new Set(["pending", "in_progress", "completed", "blocked", "abandoned"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.length > 0;
const timestamp = (value) => Number.isSafeInteger(value) && value >= 0;

export function parseSnapshot(raw, terminalId) {
  try {
    const s = JSON.parse(raw);
    if (!object(s) || s.version !== 1 || s.terminalId !== terminalId ||
        !Number.isSafeInteger(s.pid) || s.pid <= 0 || !text(s.sessionId) || !text(s.rootAgentId) ||
        !timestamp(s.updatedAt) || typeof s.closed !== "boolean" ||
        !Array.isArray(s.children) || !Array.isArray(s.todos)) return null;
    const ids = new Set([s.rootAgentId]);
    for (const child of s.children) {
      if (!object(child) || !text(child.id) || ids.has(child.id) || !text(child.parentId) ||
          !text(child.agent) || typeof child.task !== "string" || !CHILD_STATUSES.has(child.status) ||
          !(child.model === null || text(child.model)) || !timestamp(child.updatedAt)) return null;
      ids.add(child.id);
    }
    for (const phase of s.todos) {
      if (!object(phase) || typeof phase.name !== "string" || !Array.isArray(phase.tasks)) return null;
      for (const task of phase.tasks) {
        if (!object(task) || typeof task.content !== "string" || !TODO_STATUSES.has(task.status) ||
            !(task.blocker === undefined || typeof task.blocker === "string")) return null;
      }
    }
    // A disconnected or cyclic lineage isn't a trustworthy tree. Reject it, rather
    // than hiding affected rows or inventing parentage.
    const parents = new Map(s.children.map((child) => [child.id, child.parentId]));
    const connected = new Set([s.rootAgentId]);
    for (const child of s.children) {
      let id = child.id;
      const visiting = new Set();
      while (!connected.has(id)) {
        if (visiting.has(id) || !parents.has(id)) return null;
        visiting.add(id);
        id = parents.get(id);
      }
      for (const seen of visiting) connected.add(seen);
    }
    return s;
  } catch {
    return null;
  }
}

// Absolute on any platform the core runs on: POSIX `/`, Windows `C:\` or `C:/`,
// or a UNC share. Herdr labels carry the writer's own path spelling.
const absolute = (p) => p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");

export function observerSource(terminal) {
  if (typeof terminal?.address !== "string") return null;
  const path = terminal.labels?.["omp.observer"];
  if (typeof path !== "string" || !absolute(path) || path.includes("\0")) return null;
  const slash = terminal.address.indexOf("/");
  const on = slash < 0 ? null : terminal.address.slice(0, slash);
  const terminalId = slash < 0 ? terminal.address : terminal.address.slice(slash + 1);
  if (!terminalId || on === "") return null;
  return { address: terminal.address, path, on, terminalId, live: terminal.state === "live" };
}

function stateOf(snapshot, live, now) {
  if (!live || !snapshot) return "unavailable";
  if (snapshot.closed) return "closed";
  return now - snapshot.updatedAt > STALE_MS ? "stale" : "live";
}

function fingerprint(entry) {
  const s = entry.snapshot;
  // Heartbeats renew freshness without needlessly rebuilding the UI.
  return JSON.stringify([entry.state, s && [s.sessionId, s.rootAgentId, s.children, s.todos]]);
}

// Presentation history belongs to one publisher/session; wire data stays intact.
function visibleSnapshot(entry, snapshot) {
  if (!snapshot) return null;
  let history = entry.childHistory;
  if (!history || history.sessionId !== snapshot.sessionId || history.rootAgentId !== snapshot.rootAgentId) {
    history = { sessionId: snapshot.sessionId, rootAgentId: snapshot.rootAgentId, seen: new Set(), hidden: new Set() };
    entry.childHistory = history;
  }
  const arrived = history.seen.size > 0 && snapshot.children.some(child => !history.seen.has(child.id));
  for (const child of snapshot.children) {
    if (child.status !== "completed" && child.status !== "failed") history.hidden.delete(child.id);
    else if (arrived && history.seen.has(child.id)) history.hidden.add(child.id);
  }
  for (const child of snapshot.children) history.seen.add(child.id);
  if (history.hidden.size === 0) return snapshot;
  const parents = new Map(snapshot.children.map(child => [child.id, child.parentId]));
  const children = snapshot.children.filter(child => !history.hidden.has(child.id)).map(child => {
    // A hidden ancestor must not take its still-running descendants with it.
    let parentId = child.parentId;
    while (history.hidden.has(parentId)) parentId = parents.get(parentId);
    return parentId === child.parentId ? child : { ...child, parentId };
  });
  return { ...snapshot, children };
}

export class ObserverReader {
  constructor(readFile, getTerminals, clock = Date.now) {
    this.readFile = readFile;
    this.getTerminals = getTerminals;
    this.clock = clock;
    this.entries = new Map();
    this.inFlight = false;
  }

  sync(terminals = this.getTerminals()) {
    const sources = terminals.map(observerSource).filter(Boolean);
    const present = new Set(sources.map((source) => source.address));
    let changed = false;
    for (const address of this.entries.keys()) {
      if (!present.has(address)) { this.entries.delete(address); changed = true; }
    }
    for (const source of sources) {
      let entry = this.entries.get(source.address);
      if (!entry || entry.source.path !== source.path || entry.source.on !== source.on || entry.source.live !== source.live) {
        entry = { source, snapshot: null, visibleSnapshot: null, state: "unavailable" };
        this.entries.set(source.address, entry);
        changed = true;
      }
      const state = stateOf(entry.snapshot, source.live, this.clock());
      if (state !== entry.state) { entry.state = state; changed = true; }
    }
    return changed;
  }

  get(address) {
    return this.entries.get(address) ?? { snapshot: null, visibleSnapshot: null, state: "unavailable" };
  }

  async poll() {
    // Even a slow remote read must not freeze freshness or label invalidation.
    if (this.inFlight) return this.sync();
    this.inFlight = true;
    let changed = false;
    try {
      changed = this.sync();
      for (const [address, entry] of [...this.entries]) {
        if (!entry.source.live) continue;
        let snapshot = null;
        try {
          const raw = await this.readFile(entry.source.path, { on: entry.source.on });
          snapshot = typeof raw === "string" ? parseSnapshot(raw, entry.source.terminalId) : null;
        } catch {
          // Missing files and unreachable machines are observation failures only.
        }
        changed = this.sync() || changed;
        // A label/session publisher may change while a remote read is pending.
        if (this.entries.get(address) !== entry) continue;
        const before = fingerprint(entry);
        entry.snapshot = snapshot;
        entry.visibleSnapshot = visibleSnapshot(entry, snapshot);
        entry.state = stateOf(snapshot, entry.source.live, this.clock());
        changed = before !== fingerprint(entry) || changed;
      }
      return changed;
    } finally {
      this.inFlight = false;
    }
  }
}

// The same connector tokens the native terminal tree uses, with no fake terminal
// addresses. Validation guarantees every node reaches the current session root.
export function observerTree(snapshot, lead = []) {
  if (!snapshot) return [];
  const byParent = new Map();
  for (const child of snapshot.children) {
    if (!byParent.has(child.parentId)) byParent.set(child.parentId, []);
    byParent.get(child.parentId).push(child);
  }
  const rows = [];
  const stack = [{ id: snapshot.rootAgentId, lead }];
  while (stack.length) {
    const parent = stack.pop();
    if (parent.child) rows.push({ child: parent.child, lines: parent.lines });
    const children = byParent.get(parent.id) ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      const last = i === children.length - 1;
      stack.push({ id: children[i].id, child: children[i], lines: [...parent.lead, last ? "└" : "├"], lead: [...parent.lead, last ? "" : "│"] });
    }
  }
  return rows;
}
