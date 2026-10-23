"""Raw authenticated VVD console. The emulator token is private, never logged.

Use capture.py for acceptance screenshots/video. This raw console can return stale
or incomplete headless GL surfaces; retain it only for controls and diagnostics.
"""
import pathlib
import socket
import sys
import time

def command(value):
    with socket.create_connection(('127.0.0.1', 5554), timeout=10) as conn:
        conn.settimeout(10)
        def receive():
            chunks = b''
            while True:
                incoming = conn.recv(65536)
                if not incoming:
                    raise RuntimeError('VVD console closed before acknowledging the command')
                chunks += incoming
                if chunks.endswith(b'OK\r\n') or b'KO:' in chunks:
                    return chunks.decode(errors='replace')
        receive()
        token = (pathlib.Path.home() / '.emulator_console_auth_token').read_text().strip()
        conn.sendall(('auth ' + token + '\n').encode())
        authenticated = receive()
        if 'KO:' in authenticated:
            raise RuntimeError('Console authentication failed')
        conn.sendall((value + '\n').encode())
        return receive()

if __name__ == '__main__':
    print(command(' '.join(sys.argv[1:])))
