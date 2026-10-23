#!/bin/zsh
# One command for the stick window: merge the lead's branch, build a diagnostic package,
# install it, play one full hosted game with synthetic phones while tracing every
# presented frame, then print per-scene fps/gaps against the Oct 20 baseline and a verdict.
#   zsh tools/device/stick-verdict.sh            # merge w/clarity, build, measure
#   NO_MERGE=1 NO_BUILD=1 PKG=<vpkg> zsh tools/device/stick-verdict.sh   # reuse a prebuilt package
#   BUILD_ONLY=1 zsh tools/device/stick-verdict.sh                      # prebuild without a stick
# Mac stays muted. Synthetic RAM-only media. Raw traces stay in /tmp, never in git.
set -u
cd "$(dirname "$0")/../.."
export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
source ~/vega/env >/dev/null 2>&1
osascript -e 'set volume output muted true' >/dev/null 2>&1
STAMP=$(date +%Y%m%d-%H%M); OUT=/tmp/snag-verdict-$STAMP; mkdir -p $OUT
say() { printf '\n== %s\n' "$*"; }

if [ -z "${NO_MERGE:-}" ]; then say "merge w/clarity"; git merge --no-edit w/clarity || { git merge --abort; echo "Merge conflict: resolve, then rerun with NO_MERGE=1"; exit 3; }; fi
SHA=$(git rev-parse --short HEAD)
PKG=${PKG:-$HOME/builds/snag-and-brag/tv_armv7-verdict-$SHA.vpkg}
if [ -z "${NO_BUILD:-}" ]; then
  say "build diagnostic $SHA (hosted relay, debug telemetry, Hermes -O)"
  CFG=$(mktemp /tmp/snag-verdict-config.XXXXXX); cp tv/src/config.ts $CFG
  TV_RELAY_URL=wss://d2q0olvpmfmvjn.cloudfront.net/ws TV_DEBUG=true node tv/tooling/configure.mjs
  { pnpm --filter @snag/tv assets && pnpm --filter @snag/tv exec react-native build-vega --build-type Release --target armv7 --use-system-js-bundles true --max-workers 2 --hermes-flags=-O,-w,-g0; } > $OUT/build.log 2>&1
  BUILD=$?; cp $CFG tv/src/config.ts; rm -f $CFG; git checkout -- assets/eyes 2>/dev/null
  [ $BUILD -eq 0 ] || { tail -20 $OUT/build.log; exit 4; }
  cp tv/build/private/kepler/tv/undefined/vega/armv7/Release/tv_armv7.vpkg $PKG
fi
echo "package $(shasum -a 256 $PKG | cut -c1-16)…  $PKG"

[ -n "${BUILD_ONLY:-}" ] && exit 0
SERIAL=${DEVICE_SERIAL:-$(vega device list 2>/dev/null | grep " : " | grep -v -i VirtualDevice | awk '{print $1}' | head -1)}
[ -n "$SERIAL" ] || { echo "No physical stick found (USB, power, developer mode)."; exit 2; }
export DEVICE_SERIAL=$SERIAL
say "control server, install, launch"
# A fresh control server per run, so the telemetry file covers exactly this game.
lsof -nP -t -iTCP:8790 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; sleep 1
(TV_CONTROL_OUTPUT_DIR=$OUT node tv/tooling/control.mjs > $OUT/control.log 2>&1 &); sleep 1; TELEMETRY=$OUT/runtime.jsonl
vega device start-port-forwarding -d $SERIAL -p 8790 -f false >/dev/null 2>&1
vega device install-app -d $SERIAL -p $PKG 2>&1 | grep -i -E 'success|fail' | sed "s/$SERIAL/<device>/g"
vega device run-cmd -d $SERIAL -c "rm -f /tmp/${PKG:t} /tmp/vs_trace1-*temp /tmp/vs_trace_log-*temp; df -k /tmp | tail -1; inputd-cli button_press KEY_HOMEPAGE" 2>&1 | tail -1
vega device terminate-app -d $SERIAL --appName com.snagbrag.tv.main >/dev/null 2>&1; sleep 2; vega device launch-app -d $SERIAL --appName com.snagbrag.tv.main >/dev/null 2>&1

say "SFX atlas probe (each clip must sound: seek-to-sound under the 600 ms end allowance)"
for i in {1..120}; do grep -q '"audio-preloaded"' $TELEMETRY 2>/dev/null && break; sleep 1; done
node tv/tooling/control.mjs send '{"command":"audio-effects","codec":"ogg","files":["sfx-mash-0","sfx-mash-6","sfx-tap","sfx-bonk","sfx-beep-0","sfx-sel","sfx-aww","sfx-coin","sfx-drumroll-2p3"]}'
for i in {1..90}; do grep -q 'audio-effects-complete' $TELEMETRY && break; sleep 1; done
python3 - $TELEMETRY > $OUT/sfx-probe.txt <<'PY'
import json, sys
L = [json.loads(l) for l in open(sys.argv[1])]
E = [m for m in L if m['kind'] == 'audio-effect']; lat = sorted(m.get('latencyMs', -1) for m in E)
ok = bool(E) and all(m['pass'] for m in E) and lat[int(len(lat) * .95)] < 600
print('SFX probe', 'PASS' if ok else 'FAIL', f"{sum(m['pass'] for m in E)}/{len(E)} plays, seek-to-sound p50 {lat[len(lat)//2] if E else '-'} ms, max {lat[-1] if E else '-'} ms",
      '| failed:', [m['file'] for m in E if not m['pass']])
PY
cat $OUT/sfx-probe.txt

say "trace + full hosted game (${GAMES:-1} game(s); about 8 minutes each)"
python3 tools/device/perf-record.py $OUT/perf $OUT/stop > /dev/null 2>&1 &
for i in {1..240}; do [ -f $OUT/perf.started ] && break; sleep 1; done
[ -f $OUT/perf.started ] || { echo "Profiler did not start"; touch $OUT/stop; exit 6; }
sleep 3
DEVICE_CHECK_GAMES=${GAMES:-1} DEVICE_CHECK_REPORT=$OUT/game.json node tools/device/verify-live.mjs > $OUT/game.log 2>&1
GAME=$?; tail -1 $OUT/game.log
sleep 3; touch $OUT/stop
for i in {1..300}; do [ -f $OUT/perf.done ] && break; sleep 1; done
# The profiler leaves its finished trace in the stick's RAM-backed /tmp (56-110 MB per game).
vega device run-cmd -d $SERIAL -c 'rm -f /tmp/vs_trace1-*temp /tmp/vs_trace_log-*temp; df -k /tmp | tail -1' 2>&1 | tail -1
TRACE=$(ls $OUT/perf/*/iter_*_vs_trace 2>/dev/null | head -1)
[ -n "$TRACE" ] || { echo "No trace pulled (stick disconnected?)"; exit 7; }

say "per-scene frames vs Oct 20 baseline"
python3 tools/device/game-frames.py $TRACE $TELEMETRY --output $OUT/frames.json --label "verdict-$SHA" > /dev/null
python3 tools/device/compare-frames.py ${BASELINE:-docs/review/stick-vs-mockup/perf/stick-baseline-20261020.json} $OUT/frames.json | tee $OUT/verdict.txt
say "frame gaps through each scene wipe (0.1 s before to 1.3 s after cue: scene)"
python3 tools/device/scene-wipes.py $TRACE $TELEMETRY | tee $OUT/wipes.txt
python3 - $OUT/game.json $OUT/sfx-probe.txt <<'PY' | tee -a $OUT/verdict.txt
import json, sys
d = json.load(open(sys.argv[1])); probe = open(sys.argv[2]).read()
print('game:', d['outcome'], d.get('reason', ''), '| audio errors', len(d['audioErrors']), '| voice lines', d['voicePaths'], '(baseline: polly 13, blips 10)',
      '| photos', d['photoDecodes'], '| min graphics free KiB', min([c.get('graphicsFreeKiB', 0) for c in d['foregroundChecks']] or [0]))
# Dead audio once produced flattering frame rates; a run without working sound proves nothing.
if d['audioErrors'] or not d['voicePaths'].get('polly') or 'PASS' not in probe:
    print('VERDICT: INVALID (audio not working: errors, no Polly lines, or SFX probe failed); fix audio before reading fps')
PY
echo "receipts: $OUT  (copy frames.json into docs/review/stick-vs-mockup/perf/ to keep it)"
if [ $GAME -eq 0 ] && grep -q 'VERDICT: PASS' $OUT/verdict.txt && ! grep -q 'VERDICT: INVALID' $OUT/verdict.txt; then exit 0; else exit 1; fi
