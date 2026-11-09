// Small helpers for the CI Dash mod.

/** Runs an async mapper over a list with a bounded number of workers. */
export async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function relTime(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export function duration(from, to = Date.now()) {
  const a = Date.parse(from || ""), b = typeof to === "number" ? to : Date.parse(to || "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "";
  const s = Math.round((b - a) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

// Artifact names are free text ("Notepad++.gcc.x86_64.Release"), so only a
// known extension counts as a file type; "Release" or "x86_64" do not.
const KNOWN_TYPES = new Set([
  "zip", "7z", "rar", "tar", "tar.gz", "tar.bz2", "tar.xz", "tar.zst", "tar.lz4", "tgz", "gz", "bz2", "xz", "zst",
  "exe", "msi", "msix", "msixbundle", "appx", "appxbundle", "dll", "pdb", "lib", "obj",
  "dmg", "pkg", "app", "dylib", "ipa",
  "deb", "rpm", "apk", "aab", "appimage", "flatpak", "snap", "so", "a",
  "jar", "war", "ear", "whl", "egg", "nupkg", "snupkg", "vsix", "crate", "gem",
  "iso", "img", "bin", "wasm", "elf",
  "pdf", "html", "htm", "json", "xml", "yml", "yaml", "toml", "txt", "log", "csv", "md", "sarif", "lcov", "trx",
  "xlsx", "docx", "pptx", "png", "jpg", "jpeg", "gif", "svg", "webp", "mp4", "mov", "webm",
  "sh", "ps1", "bat", "cmd", "py", "js", "ts",
]);

/** The file extension of an artifact name when it is a known type (`zip`, `exe`, `tar.gz`), else "". */
export function fileType(name) {
  const m = /\.(tar\.(?:gz|bz2|xz|zst|lz4)|[a-z0-9]+)$/.exec(String(name || "").toLowerCase());
  return m && KNOWN_TYPES.has(m[1]) ? m[1] : "";
}

export function bytes(n) {
  if (!Number.isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/**
 * Maps a run, job or step to a state: "running", "queued", "success",
 * "failure", "warning" or "neutral". `done` is true when it can no longer change.
 */
export function stateOf(item) {
  const status = item?.status, conclusion = item?.conclusion;
  if (status === "in_progress") return { kind: "running", label: "running", done: false };
  if (status && status !== "completed") return { kind: "queued", label: String(status).replace(/_/g, " "), done: false };
  switch (conclusion) {
    case "success": return { kind: "success", label: "success", done: true };
    case "failure": return { kind: "failure", label: "failed", done: true };
    case "timed_out": return { kind: "failure", label: "timed out", done: true };
    case "startup_failure": return { kind: "failure", label: "startup failure", done: true };
    case "action_required": return { kind: "warning", label: "action required", done: true };
    case "cancelled": return { kind: "neutral", label: "cancelled", done: true };
    case "skipped": return { kind: "neutral", label: "skipped", done: true };
    case "neutral": return { kind: "neutral", label: "neutral", done: true };
    case "stale": return { kind: "neutral", label: "stale", done: true };
    default: return { kind: "neutral", label: conclusion || "completed", done: status === "completed" };
  }
}

export const GLYPH = { success: "✓", failure: "✕", warning: "!", neutral: "–", queued: "○", running: "●" };
