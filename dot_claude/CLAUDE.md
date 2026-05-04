# CLAUDE.md

Global context for Claude Code — applies to all projects under this home directory.

## Identity

- Name: {{ .name }}
- Primary OS: Windows 11 (PowerShell + WezTerm)

## Environment

- Shell: PowerShell 7 (`pwsh`)
- Editor: Neovim / VS Code
- Terminal: WezTerm
- Dotfiles managed by chezmoi at `~/.local/share/chezmoi`

## Git

- OSS work lives under `{{ .git_oss }}`
- Work projects live under `{{ .git_work }}`
- Dual git identity configured via `includeIf` in `~/.gitconfig`
- Key aliases: `sync` (fetch+rebase+prune), `stack`/`push-stack` (branch stacking), `absorb`

## Preferences

- Terse responses — no trailing summaries or recaps
- No unnecessary comments in code
- No emojis unless asked
- Prefer editing existing files over creating new ones
- Always prefer PowerShell over bash
- Files that support schemas should always call it explicitly.

## Open Brain

When I make a project decision, share new context about people or projects,
express a workflow preference, or land on a reusable insight, proactively offer
to capture it to my Open Brain via the capture_thought tool at a natural pause.
Skip transient state and duplicates.

## Local Overrides

If `~/CLAUDE_LOCAL.md` exists, read it and treat its contents as taking precedence over everything in this file.
