#!/usr/bin/env bash
#
# Scan for accidentally committed secrets and machine-specific paths.
#
# Usage:
#   scripts/scan-secrets.sh            # scan all tracked files (used in CI)
#   scripts/scan-secrets.sh --staged   # scan staged changes (used by the pre-commit hook)
#
# Flags content that should never be committed:
#   - Absolute home paths (e.g. /Users/<name>/..., /home/<name>/...) that leak a username
#   - Private key blocks (-----BEGIN ... PRIVATE KEY-----)
#   - AWS access key ids (AKIA...)
#   - Git bundle files (*.bundle) — these can embed full repo history, including secrets
#
# False positives can be allowlisted by adding the placeholder username to ALLOW_USER_RE.
#
# Portable to bash 3.2 (macOS default): no mapfile, uses process substitution so the
# loop runs in the current shell and error state is preserved.

set -uo pipefail

MODE="tree"
[[ "${1:-}" == "--staged" ]] && MODE="staged"

# Placeholder usernames that are fine to appear in example paths.
ALLOW_USER_RE='^(user|username|youruser|your-user|you|me|name|example|home|opt|REPLACE.*)$'

errfile="$(mktemp)"
trap 'rm -f "$errfile"' EXIT

list_files() {
  if [[ "$MODE" == "staged" ]]; then
    git diff --cached --name-only --diff-filter=ACM
  else
    git ls-files
  fi
}

while IFS= read -r f; do
  [[ -z "$f" ]] && continue

  # Never allow git bundles in the repo.
  if [[ "$f" == *.bundle ]]; then
    echo "git bundle committed: $f (bundles can embed full history; keep them out of the repo)" >>"$errfile"
    continue
  fi

  # Skip lockfiles and binary asset types.
  case "$f" in
    package-lock.json | *.png | *.jpg | *.jpeg | *.gif | *.ico | *.svg | *.webp | *.woff | *.woff2 | *.ttf | *.pdf) continue ;;
  esac

  if [[ "$MODE" == "staged" ]]; then
    content="$(git show ":$f" 2>/dev/null)"
  else
    content="$(cat "$f" 2>/dev/null)"
  fi
  [[ -z "$content" ]] && continue

  # Absolute home paths with a real-looking username.
  while IFS= read -r m; do
    [[ -z "$m" ]] && continue
    u="$(printf '%s' "$m" | sed -E 's#.*/(Users|home)/([A-Za-z0-9._-]+)/.*#\2#')"
    if ! printf '%s' "$u" | grep -qiE "$ALLOW_USER_RE"; then
      echo "absolute home path in $f: $m" >>"$errfile"
    fi
  done < <(printf '%s\n' "$content" | grep -oE '/(Users|home)/[A-Za-z0-9._-]+/' | sort -u)

  if printf '%s\n' "$content" | grep -qE -- '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----'; then
    echo "private key block in $f" >>"$errfile"
  fi
  if printf '%s\n' "$content" | grep -qE 'AKIA[0-9A-Z]{16}'; then
    echo "AWS access key id in $f" >>"$errfile"
  fi
done < <(list_files)

if [[ -s "$errfile" ]]; then
  echo "secret/path scan FAILED:" >&2
  sed 's/^/  - /' "$errfile" >&2
  echo "" >&2
  echo "Remove the above before committing. If a match is a false positive," >&2
  echo "add the placeholder username to ALLOW_USER_RE in scripts/scan-secrets.sh." >&2
  exit 1
fi

echo "scan-secrets: clean (mode=$MODE)"
