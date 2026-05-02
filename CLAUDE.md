# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

This is a [chezmoi](https://chezmoi.io)-managed dotfiles repository for a Windows-primary development environment with Unix support. Chezmoi handles applying these files to the home directory.

## Chezmoi Conventions

- Files prefixed with `dot_` map to dotfiles (e.g., `dot_gitconfig.tmpl` → `~/.gitconfig`)
- Files prefixed with `run_once_` run once on first apply
- Files prefixed with `run_onchange_` run whenever the file content changes
- Files ending in `.tmpl` are Go templates rendered by chezmoi using data from `.chezmoi.toml.tmpl`
- `AppData/` and `dot_config/` mirror their target directory structure

## Key Template Variables

Defined in `.chezmoi.toml.tmpl` and available in all `.tmpl` files:

- `{{ .name }}` — "Gilbert Sanchez"
- `{{ .email }}` — prompted on init
- `{{ .git_oss }}` and `{{ .git_work }}` — separate OSS/work git directories (must end with `/`)
- `{{ .hasPwsh }}` / `{{ .pwshPath }}` — whether `pwsh` is available
- `{{ .codespaces }}` — true when running in GitHub Codespaces

## External Dependencies

Managed in `.chezmoiexternal.toml.tmpl` — repos cloned automatically:
- **Windows**: NeoVim config → `AppData/Local/nvim`; ZeBar Quiet Velvet theme
- **Unix**: NeoVim config, Oh-My-Zsh, Tmux Plugin Manager, Vim plugins (airline, ctrlp, solarized)

All external repos refresh on a 168h (weekly) interval.

## Package Management

Packages are defined in `.chezmoidata/packages.json` and installed by `run_onchange_windows-install-packages.ps1.tmpl`:
- **Chocolatey**: chezmoi, espanso, gh, fzf, starship, wezterm, pwsh, etc.
- **PowerShell modules** (PSGallery): Pester, Posh-Git, PSReadLine, Terminal-Icons, etc.

To add a package, edit `.chezmoidata/packages.json` — the install script reads from it.

## PowerShell Profile Architecture

The PowerShell profile (`dot_config/powershell/profile.ps1.tmpl`) dot-sources scripts from `~/.local/share/powershell/Scripts/`:
- `Initialize-Profile.ps1` — main entry point; loads other scripts
- `Functions.ps1` — custom functions, aliases, history picker
- `GitTools.ps1` — git utilities
- `ShellIntegration.ps1` — terminal/editor integration

The profile uses a hash-based change detection to skip reloading unchanged configs.

## Git Configuration

`dot_gitconfig.tmpl` sets up dual-identity git using `includeIf`:
- `{{ .git_oss }}` dir uses the main config
- `{{ .git_work }}` dir uses a separate work identity

Notable custom aliases: `sync` (fetch+rebase+prune), `stack`/`push-stack` (branch stacking workflow), `absorb` (calls git-absorb).

## Applying Changes

```bash
# Apply dotfiles to home directory
chezmoi apply

# Preview changes without applying
chezmoi diff

# Edit a managed file (opens in VS Code, applies on save)
chezmoi edit <file>

# Re-run a run_onchange script manually
chezmoi apply --force
```

## Platform-Specific Files

Files excluded per platform via `.chezmoiignore`:
- **On Windows**: `dot_tmux.conf`, `dot_vimrc`, `dot_zshrc.tmpl`, zsh scripts — these are Unix-only
- **On Unix**: Windows-specific paths (`AppData/`, `komorebi.json`, etc.) are not managed

## Espanso Prompts

AI prompt snippets live in `AppData/Roaming/espanso/match/prompts.yml`. Triggers use backtick prefix (e.g., `` `prompt ``, `` `rubrik ``). These are text-expansion templates for Claude/AI workflows.
