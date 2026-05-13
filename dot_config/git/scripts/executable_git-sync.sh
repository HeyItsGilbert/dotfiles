#!/usr/bin/env bash
# git-sync: fetch + rebase default + prune merged + flag orphans + return to original branch.
# Invoked via the `sync` git alias.

set -u

cb=$(git branch --show-current)
default=$(git default-branch)
stashed=0

# Autostash any uncommitted tracked changes so checkout doesn't bail.
# Untracked files (like .claude/) are intentionally left alone.
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    git stash push -m "git-sync autostash" >/dev/null && stashed=1
fi

git fetch --all --prune --prune-tags --tags || { echo "fetch failed"; exit 1; }
git checkout "$default" || { echo "checkout failed"; exit 1; }

# Explicit rebase target — don't rely on upstream tracking being set.
git rebase "origin/$default" || { echo "rebase failed"; exit 1; }

# gh poi handles squash-merged branches via the GitHub API.
# Non-fatal: continue the sync even if gh is missing or the call fails.
if command -v gh >/dev/null 2>&1; then
    gh poi || echo "(gh poi skipped or failed; continuing)"
else
    echo "(gh poi unavailable; install with: gh extension install seachicken/gh-poi)"
fi

# Flag patch-equivalent orphans — catches the case gh poi misses:
# branches whose commits were absorbed into someone else's PR (no PR of their own).
echo ""
echo "Branches with zero unique commits vs origin/$default (likely safe to delete):"
git for-each-ref --format="%(refname:short)" refs/heads | while read -r b; do
    [ "$b" = "$default" ] && continue
    unapplied=$(git cherry "origin/$default" "$b" 2>/dev/null | grep -c "^+")
    [ "$unapplied" = "0" ] && echo "  $b"
done

# Return to original branch if it still exists; otherwise stay on default.
if [ -n "$cb" ] && git show-ref --verify --quiet "refs/heads/$cb"; then
    git checkout "$cb"
else
    echo "Branch '$cb' was pruned or detached; staying on $default"
fi

if [ "$stashed" = "1" ]; then
    git stash pop >/dev/null 2>&1
fi
