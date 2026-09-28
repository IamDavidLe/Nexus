# Repo Git hooks

This folder contains repository-local Git hooks. To enable them run:

```bash
./githooks-install.sh
```

Notes:
- The pre-push hook will create separate commits per staged file, or split the
  last local commit into per-file commits if it touched multiple files and
  hasn't been pushed yet.
- The hook avoids rewriting pushed history; if you need to split already-pushed
  commits, do it manually and force-push.
