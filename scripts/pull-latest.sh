#!/usr/bin/env bash
#
# Update a local copy of Richie Transport Services to the latest push.
#
#   ./scripts/pull-latest.sh
#
# It is deliberately cautious: it refuses to run when there is uncommitted
# work, it only ever fast-forwards (it never rewrites a commit you have),
# it switches to the tracking branch if you are on the wrong one, and it
# tells you when the dependencies changed so you know to re-run `npm ci`.
#
# Set BRANCH to pull a different branch:
#   BRANCH=main ./scripts/pull-latest.sh
#
set -euo pipefail

BRANCH="${BRANCH:-arena/1ef49b8d-rts}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d .git ]; then
  echo "!! $ROOT is not a git checkout." >&2
  exit 1
fi

echo "==> repository : $ROOT"
echo "==> branch     : $BRANCH"

# 1. never clobber local work
if [ -n "$(git status --porcelain)" ]; then
  echo >&2
  echo "!! You have uncommitted changes:" >&2
  git status --short >&2
  echo >&2
  echo "   Keep them:  git stash push -u -m 'before pull'" >&2
  echo "   Drop them:  git reset --hard origin/$BRANCH" >&2
  exit 1
fi

BEFORE="$(git rev-parse --short HEAD)"

# 2. fetch the branch
echo "==> fetching origin/$BRANCH"
git fetch origin "$BRANCH"

# 3. fast-forward onto it
if [ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]; then
  echo "==> switching to $BRANCH"
  git checkout -B "$BRANCH" "origin/$BRANCH"
else
  if ! git merge --ff-only "origin/$BRANCH"; then
    echo >&2
    echo "!! This branch has diverged from origin/$BRANCH." >&2
    echo "   Nothing was changed. Resolve it with:" >&2
    echo "     git rebase origin/$BRANCH" >&2
    echo "   or take the remote version:" >&2
    echo "     git reset --hard origin/$BRANCH" >&2
    exit 1
  fi
fi

AFTER="$(git rev-parse --short HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "==> already up to date ($AFTER)"
else
  echo "==> updated $BEFORE -> $AFTER"
  git log --oneline "$BEFORE..$AFTER" | sed 's/^/    /'
fi

# 4. did the dependency tree change?
if git diff --name-only "$BEFORE" "$AFTER" -- package.json package-lock.json | grep -q .; then
  echo
  echo "==> dependencies changed — run:  npm ci"
fi

echo
echo "==> done. To run it:  npm run build && npm start"
