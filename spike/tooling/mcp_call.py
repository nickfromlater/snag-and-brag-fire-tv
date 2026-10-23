"""Call the installed Builder Tools over real MCP stdio without restarting Codex.

Usage: python3 spike/tooling/mcp_call.py '[{"name":"tool", "arguments":{}}]'
No argument lists tools. Each invocation starts a fresh server/context.
"""
import json
import os
import pathlib
import select
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
SERVER = ROOT / "spike/tooling/node_modules/.bin/amazon-devices-buildertools-mcp"
temporary = ROOT / 'spike/.cache/tmp'
temporary.mkdir(parents=True, exist_ok=True)
environment = dict(os.environ, TMPDIR=str(temporary))
process = subprocess.Popen([str(SERVER)], cwd=ROOT, stdin=subprocess.PIPE,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           text=True, bufsize=1, env=environment)
sequence = 0

def request(method, params=None, notification=False):
    global sequence
    sequence += 1
    message = {"jsonrpc": "2.0", "method": method, "params": params or {}}
    if not notification:
        message["id"] = sequence
    process.stdin.write(json.dumps(message) + "\n")
    process.stdin.flush()
    if notification:
        return
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if not select.select([process.stdout], [], [], 1)[0]:
            if process.poll() is not None:
                raise RuntimeError(f"MCP exited {process.returncode}")
            continue
        line = process.stdout.readline()
        try:
            result = json.loads(line)
        except json.JSONDecodeError:
            continue
        if result.get("id") == sequence:
            return result.get("result", result.get("error"))
    raise TimeoutError(method)

try:
    request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                           "clientInfo": {"name": "snag-spike", "version": "1"}})
    request("notifications/initialized", notification=True)
    value = sys.argv[1] if len(sys.argv) > 1 else '[]'
    if value.startswith('@'):
        value = pathlib.Path(value[1:]).read_text()
    calls = json.loads(value)
    if calls and not any(c['name'] == 'set_project_context' for c in calls):
        request("tools/call", {"name": "set_project_context", "arguments": {
            "config": json.loads((ROOT / '.adbt-config.json').read_text())}})
    if not calls:
        print(json.dumps(request("tools/list"), indent=2))
    for call in calls:
        result = request("tools/call", call)
        print(json.dumps({"tool": call["name"], "arguments": call.get('arguments'),
                          "result": result}))
finally:
    process.terminate()
    process.wait(timeout=5)
