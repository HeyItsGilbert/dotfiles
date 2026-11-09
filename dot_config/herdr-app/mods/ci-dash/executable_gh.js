// GitHub access for the CI Dash mod. Every call goes through the `gh` CLI, so
// the existing `gh auth login` session is reused and no credential is stored.
import { exec } from "herdr";

export class GhError extends Error {
  constructor(message, { status = null, path = "" } = {}) {
    super(message);
    this.name = "GhError";
    this.status = status;
    this.path = path;
  }
}

function cleanError(stderr, stdout) {
  const text = String(stderr || stdout || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed.message) return parsed.message;
  } catch {}
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3).join(" ");
}

export function errorHint(error) {
  if (!(error instanceof GhError)) return "";
  if (error.status === 401) return "Run gh auth login and try again.";
  if (error.status === 403) return "The token may need Actions permission, or the organization may require SSO authorization.";
  if (error.status === 404) return "The repository was not found, or the token has no access.";
  if (error.status === 429) return "GitHub rate limit reached. Wait a moment and retry.";
  return "";
}

// exec() resolves with a non-zero code instead of rejecting; turn that into an error.
// `account`: run as that gh login instead of the active one (exec takes no env, so a shell
// sets GH_TOKEN from `gh auth token` for this one call; the token never leaves it).
async function gh(args, { cwd, on, account = null, host = "github.com" } = {}) {
  let result;
  try {
    result = account
      ? await exec("sh", ["-c", 'GH_TOKEN="$(gh auth token -h "$1" -u "$2")" || exit 4; shift 2; GH_TOKEN="$GH_TOKEN" exec gh "$@"', "gh", host, account, ...args], { cwd, on })
      : await exec("gh", args, { cwd, on });
  } catch (e) {
    throw new GhError(`Could not start gh: ${e}. Install it from https://cli.github.com and run gh auth login.`);
  }
  if (result.code !== 0) {
    const message = cleanError(result.stderr, result.stdout) || `gh exited with status ${result.code}`;
    const status = /HTTP (\d{3})/.exec(result.stderr)?.[1];
    throw new GhError(message, { status: status ? Number(status) : null, path: args.slice(0, 4).join(" ") });
  }
  return result.stdout;
}

/** The argv of the dispatch call. Kept separate so it can be inspected and tested. */
export function dispatchArgs(repo, workflowId, ref, inputs) {
  const args = ["api", "--hostname", repo.host, "--method", "POST", "--header", "Accept: application/vnd.github+json",
    `repos/${repo.owner}/${repo.name}/actions/workflows/${workflowId}/dispatches`,
    "-f", `ref=${ref}`];
  for (const [name, value] of Object.entries(inputs)) args.push("-f", `inputs[${name}]=${value}`);
  args.push("-F", "return_run_details=true");
  return args;
}

/** The logins gh holds, the active one first: [{ host, login, active }]. */
async function accounts(on) {
  const r = await exec("gh", ["auth", "status"], { on }).catch(() => null);
  const out = [], text = `${r?.stdout ?? ""}\n${r?.stderr ?? ""}`;
  let last = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /Logged in to (\S+) account (\S+)/.exec(line);
    if (m) { last = { host: m[1], login: m[2], active: false }; out.push(last); continue; }
    if (last && /Active account: true/.test(line)) last.active = true;
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active));
}

// Repositories gh's active login can't see (an organization reached by another login)
// are tried with each other login; the first that can see it is kept for that repo.
const NOT_VISIBLE = /Could not resolve to a Repository|HTTP 404|Not Found/i;

/** Finds the GitHub repository of a folder with `gh repo view`. */
export async function resolveRepo({ cwd, on, override }) {
  const args = ["repo", "view", ...(override ? [override] : []), "--json", "nameWithOwner,url,isPrivate,defaultBranchRef"];
  const parse = (out, account) => {
    const data = JSON.parse(out);
    const [owner, name] = data.nameWithOwner.split("/");
    const host = new URL(data.url).host;
    return { host, owner, name, slug: data.nameWithOwner, isPrivate: Boolean(data.isPrivate), defaultBranch: data.defaultBranchRef?.name || "", account };
  };
  try {
    return parse(await gh(args, { cwd, on }), null);
  } catch (first) {
    if (!NOT_VISIBLE.test(first.message)) throw first;
    for (const a of (await accounts(on)).filter((x) => !x.active)) {
      try { return parse(await gh(args, { cwd, on, account: a.login, host: a.host }), a.login); } catch (_) {}
    }
    throw new GhError(first.message, { status: 404, path: "repo view" });
  }
}

export class Gh {
  constructor({ repo, cwd, on }) {
    this.repo = repo;
    this.cwd = cwd;
    this.on = on;
  }

  opts() { return { cwd: this.cwd, on: this.on, account: this.repo.account ?? null, host: this.repo.host }; }

  rp(suffix = "") { return `repos/${this.repo.owner}/${this.repo.name}${suffix}`; }

  async json(path, { method, paginate = false } = {}) {
    const args = ["api", "--hostname", this.repo.host];
    if (method) args.push("--method", method);
    if (paginate) args.push("--paginate", "--slurp");
    args.push("--header", "Accept: application/vnd.github+json", path);
    const out = (await gh(args, this.opts())).trim();
    if (!out) return null;
    try { return JSON.parse(out); } catch { throw new GhError(`GitHub returned invalid JSON for ${path}`, { path }); }
  }

  async pages(path, key) {
    const data = await this.json(path, { paginate: true });
    return (Array.isArray(data) ? data : [data]).flatMap((page) => page?.[key] || []);
  }

  /** A file as raw text. The mod runtime has no Buffer, so never ask for base64. */
  async rawFile(path, ref) {
    const args = ["api", "--hostname", this.repo.host, "--header", "Accept: application/vnd.github.raw+json",
      this.rp(`/contents/${String(path).split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`)];
    const text = await gh(args, this.opts());
    if (!text.trim()) throw new GhError(`${path} is empty on ${ref}`);
    return text;
  }

  async listBranches() {
    const pages = await this.json(this.rp("/branches?per_page=100"), { paginate: true });
    return (Array.isArray(pages) ? pages.flat() : []).map((b) => ({ name: b.name, protected: Boolean(b.protected) }));
  }

  /**
   * Starts a workflow run. exec() has no stdin, so the body is sent as fields:
   * -f keeps every input a string (-F would turn "true" or "12" into JSON types).
   * Resolves with the new run id when GitHub returns it, else null.
   */
  async dispatch(workflowId, ref, inputs) {
    const args = dispatchArgs(this.repo, workflowId, ref, inputs);
    const out = (await gh(args, this.opts())).trim();
    if (!out) return { runId: null };
    try { const data = JSON.parse(out); return { runId: data.workflow_run_id ?? null }; } catch { return { runId: null }; }
  }

  async listDispatchRuns(workflowId, { ref, actor, perPage = 20 } = {}) {
    const params = new URLSearchParams({ event: "workflow_dispatch", per_page: String(perPage) });
    if (ref) params.set("branch", ref);
    if (actor) params.set("actor", actor);
    return (await this.json(this.rp(`/actions/workflows/${workflowId}/runs?${params}`))).workflow_runs || [];
  }

  async getLogin() { return (await this.json("user")).login; }
  async listRuns(perPage = 30) { return (await this.json(this.rp(`/actions/runs?per_page=${perPage}`))).workflow_runs || []; }
  async getRun(id) { return this.json(this.rp(`/actions/runs/${id}`)); }
  async listJobs(id) { return this.pages(this.rp(`/actions/runs/${id}/jobs?per_page=100`), "jobs"); }
  async listArtifacts(id) { return this.pages(this.rp(`/actions/runs/${id}/artifacts?per_page=100`), "artifacts"); }
  async listWorkflows() { return this.pages(this.rp("/actions/workflows?per_page=100"), "workflows"); }
  async latestRuns(workflowId, perPage = 5) { return (await this.json(this.rp(`/actions/workflows/${workflowId}/runs?per_page=${perPage}`))).workflow_runs || []; }
  async cancelRun(id) { await this.json(this.rp(`/actions/runs/${id}/cancel`), { method: "POST" }); }
  async rerunRun(id) { await this.json(this.rp(`/actions/runs/${id}/rerun`), { method: "POST" }); }
  async openRunWeb(id) { await gh(["run", "view", String(id), "--web", "-R", `${this.repo.host}/${this.repo.slug}`], this.opts()); }

  /** Downloads one artifact into `dir`. exec() allows 30 s, so very large artifacts can time out. */
  async downloadArtifact(runId, name, dir) {
    await gh(["run", "download", String(runId), "--name", name, "--dir", dir, "-R", `${this.repo.host}/${this.repo.slug}`], this.opts());
  }
}

/** A folder name that is safe on Windows, macOS and Linux. */
export function safeName(name) {
  const cleaned = String(name || "").trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/^\.+/, "_").replace(/[. ]+$/, "");
  return cleaned || "artifact";
}
