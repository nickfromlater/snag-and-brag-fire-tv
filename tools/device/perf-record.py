"""Record one whole-game Perfetto trace from the stick with the SDK profiler.

The profiler is interactive (press s to start/stop). This drives it in a PTY:
it starts recording, writes OUT.started, stops when STOPFLAG exists, then quits
and writes OUT.done. Categories default to graphics+lifecycle: small enough for a
full game in one buffer (the ui category fills 96 MB in ~100 s).
usage: DEVICE_SERIAL=... python3 perf-record.py OUTDIR STOPFLAG [categories]
"""
import os, pty, select, sys, time
out, flag = sys.argv[1], sys.argv[2]
cats = sys.argv[3] if len(sys.argv) > 3 else "['graphics','lifecycle']"
serial = os.environ['DEVICE_SERIAL']
cmd = (f'source $HOME/vega/env >/dev/null 2>&1; exec vega exec perf record --app-name com.snagbrag.tv.main '
       f'--device-serial-number {serial} --recording-timeout 900 --trace-categories="{cats}" '
       f'--trace-buffer-memory-kb 98304 --disable-ring-buffer --output-dir {out}')
pid, fd = pty.fork()
if pid == 0: os.execvp('/bin/zsh', ['/bin/zsh', '-c', cmd])
buf, state, t0 = b'', 'wait-start', time.time()
log = open(out + '.log', 'wb')
def feed(timeout=1.0):
    global buf
    if select.select([fd], [], [], timeout)[0]:
        try: d = os.read(fd, 65536)
        except OSError: return False
        if not d: return False
        buf += d; log.write(d.replace(serial.encode(), b'<device>')); log.flush()
    return True
while time.time() - t0 < 1800:
    if not feed(): break
    if state == 'wait-start' and b'Press s to start recording' in buf:
        os.write(fd, b's'); state, buf = 'recording', b''; open(out + '.started', 'w').write(str(time.time()))
    elif state == 'recording' and os.path.exists(flag):
        os.write(fd, b's'); state, buf = 'stopping', b''
    elif state in ('stopping', 'recording') and b'Press s to start recording' in buf:
        os.write(fd, b'q'); open(out + '.done', 'w').write(state); state = 'done'
        for _ in range(20): feed(.5)
        break
if state != 'done':
    open(out + '.done', 'w').write('failed:' + state)
    try: os.kill(pid, 15)
    except OSError: pass
