#!/usr/bin/env bash
# lint-mandates.sh — prove the factory is generic (BLUEPRINT steps 36, 37, 53).
#
# Fails if any mandate, protocol or tool doc contains:
#   1. a term from tools/banned-terms.txt (case-insensitive, whole word)
#   2. "transaction" in any phrase other than "database transaction(s)"
#   3. an absolute URL-style path such as /things/{id} or any http(s) URL
#   4. a snake_case or camelCase identifier
#   5. a number shaped like an HTTP status or 3-digit error code (100-599)
#
# Usage: tools/lint-mandates.sh [file ...]   (defaults to the factory's generic docs)
# Exit:  0 clean, 1 hits found, 2 usage or internal error.
#
# The rules are never weakened to make a file pass: generalise the sentence instead.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
terms_file="$root/tools/banned-terms.txt"

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  shopt -s nullglob
  files=("$root"/factory/mandates/*.md "$root"/factory/protocols/*.md "$root"/tools/*.md)
  shopt -u nullglob
fi
[ "${#files[@]}" -gt 0 ] || { echo "lint-mandates: no files to check" >&2; exit 2; }
[ -f "$terms_file" ] || { echo "lint-mandates: missing $terms_file" >&2; exit 2; }

# A word boundary written out explicitly. grep -w is avoided on purpose: some grep builds
# (Git for Windows) abort when -w is combined with -i and -F.
B_START='(^|[^[:alnum:]_])'
B_END='([^[:alnum:]_]|$)'

# grep wrapper: 0 = match, 1 = no match, anything else is a crash and fails the lint.
# A check that crashed must never read as "clean".
g() {
  local rc=0
  grep "$@" || rc=$?
  if [ "$rc" -gt 1 ]; then
    echo "lint-mandates: grep failed (exit $rc); refusing to report clean" >&2
    exit 2
  fi
}

hits=0
report() { # rule, matching lines
  local rule=$1 out=$2 line
  [ -z "$out" ] && return 0
  while IFS= read -r line; do
    echo "  [$rule] ${line#"$root"/}"
    hits=$((hits + 1))
  done <<< "$out"
}

# 1. banned terms, whole word, regex metacharacters escaped so every term matches literally
while IFS= read -r term || [ -n "$term" ]; do
  term=${term%$'\r'}
  case "$term" in ''|'#'*) continue ;; esac
  esc=$(printf '%s' "$term" | sed 's/[][\.*^$+?(){}|/]/\\&/g')
  report "banned: $term" "$(g -HniE -- "${B_START}${esc}${B_END}" "${files[@]}")"
done < "$terms_file"

# 2. "transaction" is allowed only as "database transaction(s)": the one generic use a mandate
#    needs (an atomic multi-record change). Every other use is a domain word and is flagged.
tx=$(g -HniE -- "${B_START}transactions?${B_END}" "${files[@]}")
report "transaction outside 'database transaction'" "$(printf '%s\n' "$tx" | { grep -viE 'database transactions?' || true; })"

# 3. absolute URL-style paths and URLs. Repo-relative paths (factory/..., tools/...) are fine.
report "url or absolute path" "$(g -HnE -- '(^|[[:space:]("`])/[A-Za-z0-9{}:_-]+/|https?://' "${files[@]}")"

# 4. code identifiers
report "snake_case identifier" "$(g -HnE -- '\b[a-z][a-z0-9]*_[a-z0-9_]+\b' "${files[@]}")"
report "camelCase identifier" "$(g -HnE -- '\b[a-z]+[A-Z][A-Za-z0-9]*\b' "${files[@]}")"

# 5. status-code-shaped numbers
report "status or error code" "$(g -HnE -- '\b[1-5][0-9]{2}\b' "${files[@]}")"

if [ "$hits" -gt 0 ]; then
  echo "lint-mandates: $hits hit(s) in ${#files[@]} file(s). Generalise the wording; never weaken the rule." >&2
  exit 1
fi
echo "lint-mandates: clean (${#files[@]} files)"
