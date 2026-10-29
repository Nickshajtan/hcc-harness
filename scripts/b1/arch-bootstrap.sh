#!/bin/sh
# Opt-in B1 feasibility entry only; not installed or emitted by setup.ts.
set -eu
fail() { printf '%s\n' "[arch bootstrap] $*" >&2; exit 1; }
app=$(CDPATH= cd -- "${0%/*}" && pwd -P)
if [ "${ARCH_NODE+x}" = x ]; then
  node=$ARCH_NODE
  case "$node" in /*) ;; *) fail 'ARCH_NODE must name an absolute compatible Node executable';; esac
else
  node=''
  oldifs=$IFS; IFS=:
  for directory in ${PATH-}; do
    [ -n "$directory" ] || continue
    if [ -f "$directory/.arch-router" ]; then continue; fi
    if [ -f "$directory/node" ] && [ -x "$directory/node" ]; then node=$directory/node; break; fi
  done
  IFS=$oldifs
  [ -n "$node" ] || fail 'No node on PATH; select Node >=24.15.0 <25 or set ARCH_NODE'
fi
[ -f "$node" ] && [ -x "$node" ] || fail 'Selected Node is missing or not executable; restore it or set ARCH_NODE'
[ ! "$node" -ef "$0" ] || fail 'Recursive Arch Node refused'
# Test-only probe of an explicitly trusted runtime. No manager discovery or PATH mutation.
version=$("$node" --version) || fail 'Node version probe failed'
case "$version" in v24.*.*) ;; *) fail 'Arch requires >=24.15.0 <25; set ARCH_NODE without changing project PATH';; esac
minor=${version#v24.}; minor=${minor%%.*}
patch=${version##*.}
case "$minor:$patch" in *[!0-9:]*|:*) fail 'Invalid Node version probe';; esac
[ "$minor" -ge 15 ] || fail 'Arch requires >=24.15.0 <25'
[ -f "$app/dist/cli.js" ] || fail 'Arch application missing; use a current installation for status/deinit'
exec "$node" "$app/dist/cli.js" "$@"
