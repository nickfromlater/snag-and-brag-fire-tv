#!/usr/bin/env python3
# Runs Perfetto's trace_processor_shell (`query TRACE SQL` prints CSV). The frame scripts used a wrapper
# in /tmp, which a Mac restart deletes; this one lives in the repo and uses the cached prebuilt.
# The Vega SDK's own trace_processor_shell has no `query` subcommand, so it can't stand in.
import glob, os, sys
cands = sorted(glob.glob(os.path.expanduser('~/.local/share/perfetto/prebuilts/trace_processor_shell*')), key=os.path.getmtime)
if not cands:
    sys.exit('No Perfetto trace_processor_shell in ~/.local/share/perfetto/prebuilts (fetch: curl -LO https://get.perfetto.dev/trace_processor && python3 trace_processor --version)')
os.execv(cands[-1], [cands[-1], *sys.argv[1:]])
