#!/usr/bin/env bash
# evidence-pack.sh — bundle the evidence for one work item (BLUEPRINT step 49).
#
# Creates <stage-dir>/evidence/<item>/ containing:
#   diffstat.txt       git diff --stat from <base> to HEAD, plus the commit list
#   commit.txt         the exact commit being handed off
#   <copied files>     every --add file (test output, logs, screenshots, reports)
#   container-check.log, if the stage has one newer than the base commit
#   INDEX.md           what is in the folder, for the handoff packet to link
#
# Usage:
#   tools/evidence-pack.sh <stage-dir> <item-id> --base <commit> [--add <file>]... [--add-dir <dir>]...
# Example:
#   tools/evidence-pack.sh stage-1 S1-04 --base HEAD~2 --add test-output.txt --add-dir screenshots
set -euo pipefail

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
stage=${1:-}; item=${2:-}
[ -n "$stage" ] && [ -n "$item" ] && [ -d "$stage" ] || usage
shift 2
base=""; adds=(); dirs=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base) base=$2; shift 2 ;;
    --add) adds+=("$2"); shift 2 ;;
    --add-dir) dirs+=("$2"); shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
done
[ -n "$base" ] || { echo "--base <commit> is required (the commit before the work started)" >&2; exit 2; }
git rev-parse --verify -q "$base^{commit}" >/dev/null || { echo "not a commit: $base" >&2; exit 2; }

out="$stage/evidence/$item"
mkdir -p "$out"

{
  echo "# git diff --stat $base..HEAD"
  git diff --stat "$base" HEAD
  echo
  echo "# commits"
  git log --oneline "$base..HEAD"
} > "$out/diffstat.txt"
git rev-parse HEAD > "$out/commit.txt"

for f in "${adds[@]+"${adds[@]}"}"; do
  [ -f "$f" ] || { echo "missing --add file: $f" >&2; exit 1; }
  cp "$f" "$out/"
done
for d in "${dirs[@]+"${dirs[@]}"}"; do
  [ -d "$d" ] || { echo "missing --add-dir: $d" >&2; exit 1; }
  cp -r "$d" "$out/"
done
if [ -f "$stage/evidence/container-check.log" ]; then
  cp "$stage/evidence/container-check.log" "$out/"
fi

{
  echo "# Evidence — $item"
  echo
  echo "Commit: \`$(cat "$out/commit.txt")\`  Base: \`$(git rev-parse "$base")\`"
  echo
  echo "| File | Size |"
  echo "|------|------|"
  (cd "$out" && find . -type f ! -name INDEX.md | sort | while read -r f; do
    printf '| %s | %s bytes |\n' "${f#./}" "$(wc -c < "$f" | tr -d ' ')"
  done)
} > "$out/INDEX.md"

echo "evidence written to $out"
cat "$out/INDEX.md"
