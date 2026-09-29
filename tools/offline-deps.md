# Building with no network

The clean container check builds every image with networking switched off for each build step, then
runs it with no network at all. Anything a build step would normally download must already be in
the repository or in the base image. The task file picks the stack; these are the patterns per
ecosystem.

## General rules

- Pin the base image by tag in the Dockerfile. Base images are pulled by the container engine before
  the offline build starts, so they are the one thing that may come from a registry.
- Commit every dependency the build needs, or a lockfile plus a vendored cache the build installs from.
- Never fetch during the build or at start-up: no package installs, no downloads, no remote fonts, no
  remote scripts in the interface. Bundle interface assets into the image.
- Prove it: run `tools/clean-container-check.sh` before every handoff that touches build or run files.

## Node

1. Keep the lockfile committed.
2. On a machine with network, fill a local cache with `npm ci --cache .npm-cache` and commit
   `.npm-cache`.
3. In the Dockerfile: copy the lockfile and the cache, then `npm ci --offline --cache .npm-cache`.
4. Alternatively, build the interface bundle outside the image and copy only the built output in.

## Python

1. On a machine with network: `pip download -r requirements.txt -d vendor/wheels` for the target
   platform of the base image (`--platform`, `--only-binary=:all:`).
2. Commit `vendor/wheels`.
3. In the Dockerfile: `pip install --no-index --find-links vendor/wheels -r requirements.txt`.

## Go

1. `go mod vendor` and commit the vendor folder.
2. In the Dockerfile: `go build -mod=vendor`.

## Databases

Prefer an embedded database that ships inside the language runtime or as a vendored library, so the
service is one container. If the task requires a separate database server, use its official image by
pinned tag and start both with a compose file whose networks are internal only.
