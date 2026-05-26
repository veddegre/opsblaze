# Deploy-only skills (`_local`)

Skills in this directory are loaded by OpsBlaze at runtime but **are not committed to git**.

Use this folder for organization-specific playbooks (identity provider indexes, custom SPL, internal index names). Copy or rsync this tree onto each server under:

- `.opsblaze/skills/_local/` (preferred), or
- `.claude/skills/_local/` (legacy)

Example:

```bash
rsync -a .claude/skills/_local/ /path/to/opsblaze/.opsblaze/skills/_local/
```

Bundled public skills live in the parent `skills/` directory. Configure skill bundles that reference `_local` skill names in **Settings → Runtime settings** on the server (not in the public repo).

**Do not copy the same skill into both** `skills/<name>/` and `skills/_local/<name>/` — if both exist, `_local` wins and duplicates in the UI are avoided only when the top-level copy is removed.
