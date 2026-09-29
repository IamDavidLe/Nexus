#!/usr/bin/env bash
# clean-container-check.sh — build and serve a stage with no network (BLUEPRINT step 43, rule C4).
#
# 1. Builds <stage-dir>/Dockerfile with networking disabled for every build step.
# 2. Runs the image with --network none and the given CPU and memory caps.
# 3. Probes the health path from a helper container that shares the product container's network
#    namespace (loopback only), so the product never gets a route out and the probe still reaches it.
# 4. Saves the whole run to <stage-dir>/evidence/container-check.log. Exit 0 = healthy, 1 = not.
#
# Usage:
#   tools/clean-container-check.sh <stage-dir> [options]
# Options (each also readable from the environment variable in brackets):
#   --health-path P     path to probe, e.g. the task's health check path     [HEALTH_PATH]  required
#   --port N            port the service listens on inside the container     [PORT]         required
#   --cpus C            CPU cap, e.g. 1                                       [CPUS]         default 1
#   --memory M          memory cap, e.g. 512m                                 [MEMORY]       default 512m
#   --timeout S         seconds to wait for a healthy answer                  [TIMEOUT]      default 60
#   --allow-build-network   let the build fetch dependencies (only if the task allows it); the
#                           service still runs with no network
#
# The health path and port always come from the task, never from this script.
set -uo pipefail

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

stage=${1:-}; [ -n "$stage" ] && [ -d "$stage" ] || usage; shift
health=${HEALTH_PATH:-}; port=${PORT:-}; cpus=${CPUS:-1}; memory=${MEMORY:-512m}; timeout=${TIMEOUT:-60}
build_net=none
while [ "$#" -gt 0 ]; do
  case "$1" in
    --health-path) health=$2; shift 2 ;;
    --port) port=$2; shift 2 ;;
    --cpus) cpus=$2; shift 2 ;;
    --memory) memory=$2; shift 2 ;;
    --timeout) timeout=$2; shift 2 ;;
    --allow-build-network) build_net=default; shift ;;
    -h|--help) usage ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
done
[ -n "$health" ] && [ -n "$port" ] || { echo "need --health-path and --port (or HEALTH_PATH and PORT)" >&2; exit 2; }
[ -f "$stage/Dockerfile" ] || { echo "no Dockerfile in $stage" >&2; exit 1; }

mkdir -p "$stage/evidence"
log="$stage/evidence/container-check.log"
tag="factory-check-$(basename "$(cd "$stage" && pwd)" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-')"
name="$tag-$$"
probe_image=busybox:1.36

exec > >(tee "$log") 2>&1
echo "== clean container check: $stage"
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ)  docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unavailable)"
echo "== build network: $build_net | run network: none | cpus: $cpus | memory: $memory | port: $port | health: $health"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# the probe image is pulled up front with host networking; it is tooling, not part of the product
docker image inspect "$probe_image" >/dev/null 2>&1 || docker pull -q "$probe_image" >/dev/null || {
  echo "FAIL: could not get probe image $probe_image"; exit 1; }

echo "== build"
if ! docker build --network "$build_net" --progress plain -t "$tag" "$stage"; then
  echo "FAIL: build failed with build network '$build_net'."
  [ "$build_net" = none ] && echo "      If a step needed to download something, vendor it (see tools/offline-deps.md)."
  exit 1
fi

echo "== run"
if ! docker run -d --name "$name" --network none --cpus "$cpus" --memory "$memory" "$tag" >/dev/null; then
  echo "FAIL: container did not start"; exit 1
fi

echo "== probe (up to ${timeout}s)"
deadline=$(( $(date +%s) + timeout ))
healthy=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" != true ]; then
    echo "FAIL: container exited early"; break
  fi
  if out=$(docker run --rm --network "container:$name" "$probe_image" \
            wget -q -T 3 -O - "http://127.0.0.1:${port}${health}" 2>&1); then
    echo "health answered: ${out:0:300}"; healthy=1; break
  fi
  sleep 2
done

echo "== outbound network check (must fail)"
if docker run --rm --network "container:$name" "$probe_image" wget -q -T 3 -O /dev/null http://example.com 2>/dev/null; then
  echo "FAIL: the container reached the internet"; healthy=0
else
  echo "ok: no outbound network"
fi

echo "== container logs"
docker logs "$name" 2>&1 | tail -n 100

if [ "$healthy" = 1 ]; then echo "PASS"; exit 0; fi
echo "FAIL: no healthy answer within ${timeout}s"; exit 1
