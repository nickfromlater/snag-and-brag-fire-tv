"""Fresh single-window VVD capture. Caller owns ~/.snag-vvd.lock; macOS 15+.

Compatible screenrecord screenshot/start/stop commands; recordings are H.264 MP4,
even when an older caller supplies a .webm filename. No audio or desktop capture.
Use console.py explicitly only for emulator control or rejected-capture diagnostics.
"""
import hashlib
import json
import os
import pathlib
import shlex
import subprocess
import sys
import tempfile
import time

SOURCE = pathlib.Path(__file__).with_name('vvd-window.swift')
LOCK = pathlib.Path.home() / '.snag-vvd.lock'
STATE = LOCK / 'window-recording.json'

def helper():
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()[:16]
    binary = pathlib.Path(tempfile.gettempdir()) / ('snag-vvd-window-' + digest)
    if not binary.exists():
        staging = binary.with_name(binary.name + '-' + str(os.getpid()))
        subprocess.run(['swiftc', '-swift-version', '5', '-parse-as-library', '-O', str(SOURCE), '-o', str(staging)], check=True)
        staging.replace(binary)
    return str(binary)

def command(value):
    args = shlex.split(value)
    if args[:1] != ['screenrecord']:
        from console import command as console_command
        return console_command(value)
    if not LOCK.is_dir():
        raise RuntimeError('Acquire ~/.snag-vvd.lock before capturing')
    action = args[1] if len(args) > 1 else ''
    if action == 'screenshot' and len(args) == 3:
        folder = pathlib.Path(args[2]).resolve()
        if not folder.is_dir():
            raise RuntimeError('Screenshot destination must be an existing directory')
        image = folder / ('Screenshot_' + str(time.time_ns()) + '.png')
        subprocess.run([helper(), 'screenshot', str(image)], check=True)
        return 'OK\n'
    if action == 'start':
        if STATE.exists():
            raise RuntimeError('A window recording is already owned by this VVD lock; stop it first')
        fps, limit, bitrate, output = 60, 170, 8000000, None
        index = 2
        while index < len(args):
            arg = args[index]
            if arg.startswith('--'):
                if index + 1 >= len(args):
                    raise ValueError('Missing recorder option value')
                option = args[index + 1]
                if arg == '--fps': fps = int(option)
                elif arg == '--time-limit': limit = int(option)
                elif arg == '--bit-rate': bitrate = int(float(option[:-1]) * 1000000) if option.upper().endswith('M') else int(option)
                elif arg == '--size' and option != '1920x1080': raise ValueError('Fresh VVD capture uses 1920x1080')
                elif arg not in ['--size', '--bit-rate']: raise ValueError('Unsupported recorder option: ' + arg)
                index += 2
            else:
                if output is not None: raise ValueError('Only one recorder output path is allowed')
                output = pathlib.Path(arg).resolve(); index += 1
        if output is None or not output.parent.is_dir() or output.exists() or bitrate < 1 or not (1 <= fps <= 60 and 1 <= limit <= 180):
            raise ValueError('Need a new output path, 1–60 fps and 1–180 seconds')
        job = pathlib.Path(tempfile.mkdtemp(prefix='snag-window-record-'))
        log = (job / 'recorder.txt').open('wb')
        process = subprocess.Popen([helper(), 'record', str(output), str(fps), str(limit), str(job), str(bitrate)], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        log.close()
        state = {'pid': process.pid, 'job': str(job), 'output': str(output), 'started': time.monotonic(), 'limit': limit}
        with STATE.open('x') as state_file:
            state_file.write(json.dumps(state))
        end = time.monotonic() + 15
        while not (job / 'ready.json').exists():
            if process.poll() is not None or time.monotonic() > end:
                process.terminate(); STATE.unlink(missing_ok=True)
                raise RuntimeError((job / 'recorder.txt').read_text()[-1000:] or 'Window recorder did not start')
            time.sleep(.05)
        return 'OK\n'
    if action == 'stop' and len(args) == 2:
        if not STATE.exists(): raise RuntimeError('No window recording owned by this VVD lock')
        state = json.loads(STATE.read_text()); job = pathlib.Path(state['job'])
        (job / 'stop').touch(); end = time.monotonic() + 20
        while not (job / 'done.json').exists():
            if time.monotonic() > end: raise RuntimeError('Window recording did not stop; owned state was retained')
            time.sleep(.05)
        result = json.loads((job / 'done.json').read_text())
        if not result.get('pass'): raise RuntimeError(result.get('error', 'Window recording failed'))
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration,size:stream=codec_name,width,height', '-of', 'json', state['output']]))
        video = probe['streams'][0]
        duration = float(result['durationSeconds'])
        minimum = max(.01, min(state.get('limit', duration), time.monotonic() - state.get('started', time.monotonic() - duration)) - .75)
        if video['codec_name'] != 'h264' or video['width'] != 1920 or video['height'] != 1080 or float(probe['format']['duration']) < minimum:
            raise RuntimeError('Window video has an invalid codec, size or duration; capture rejected and owned state retained')
        result['durationSeconds'] = float(probe['format']['duration'])
        result['bytes'] = int(probe['format']['size'])
        pathlib.Path(state['output'] + '.capture.json').write_text(json.dumps(result, indent=2) + '\n')
        STATE.unlink()
        import shutil
        shutil.rmtree(job)
        return 'OK\n'
    raise ValueError('Use screenrecord screenshot existing-directory, start [options] new-output.mp4, or stop')

if __name__ == '__main__':
    print(command(' '.join(sys.argv[1:])), end='')
