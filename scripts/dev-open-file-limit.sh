#!/usr/bin/env bash
# Raise the open-file soft limit for the dev stack. Sourced, not executed — a
# child process cannot raise its parent's limit.
#
# macOS hands GUI-launched terminals a 256-descriptor soft limit (see
# `launchctl limit maxfiles`), and a Next webpack compile of the docs app
# exhausts it within seconds of starting: "EMFILE: too many open files, watch".
# The hard limit is unlimited, so raising the soft limit needs no sudo — and a
# shell that already has headroom is left alone.

raise_open_file_limit() {
  local want=65536
  local soft hard
  soft="$(ulimit -S -n 2>/dev/null || echo unlimited)"
  hard="$(ulimit -H -n 2>/dev/null || echo unlimited)"
  [[ "$soft" == "unlimited" ]] && return 0
  if [[ "$hard" != "unlimited" ]] && ((hard < want)); then
    want="$hard"
  fi
  ((soft >= want)) && return 0
  if ulimit -S -n "$want" 2>/dev/null; then
    echo "==> Raised open-file limit ${soft} → $(ulimit -S -n)" >&2
  else
    echo "(warn) open-file limit is ${soft}; the docs dev server may fail with EMFILE." >&2
  fi
}
