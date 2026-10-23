#!/usr/bin/env python3
"""Audit current first-party files without printing any matched value or secret.

Includes tracked files (even ignored ones), visible untracked first-party files,
binary path/key signatures and an ignored .env filename inventory. Does not read
notes/, Git metadata/history, dependencies or generated build/cache directories.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SKIP = {'.git', 'notes', 'node_modules', '.pnpm', 'build', '.build', 'dist', 'out', '.cache', '__pycache__', '.vite', 'coverage', '.tmp'}
account = os.environ.get('SCRUB_ACCOUNT', getpass.getuser()).encode()
RULES = {
    'home-path-or-account': re.compile(rb'/(?:Users|home)/[^/\s\x00"\'<>:\\]{1,100}' + (rb'|\b' + re.escape(account) + rb'\b' if account else b''), re.I),
    'internal-reference': re.compile(rb'\b(?:workbench|attn|orchestrator|fleet|tailnet|tailscale)\b|~/Desktop/knowledge|\b[a-z0-9.-]{1,120}\.ts\.net\b', re.I),
    'email': re.compile(rb'(?<![a-z0-9._%+-])[a-z0-9._%+-]{1,100}@[a-z0-9.-]{1,100}\.[a-z]{2,20}\b', re.I),
    'phone-number': re.compile(rb'(?<![\w\d])(?:\+1[- .]?)?\(?\d{3}\)?[- .]\d{3}[- .]\d{4}(?!\d)'),
    'street-address': re.compile(rb'\b\d{1,5}\s+[a-z][a-z .]{1,35}\s+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Lane|Ln\.|Drive|Dr\.|Boulevard|Blvd\.)\b', re.I),
    'key-or-token': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|(?<![A-Za-z0-9_])(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_\-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{15,1000}\.[A-Za-z0-9_-]{15,1000}\.[A-Za-z0-9_-]{15,1000}|(?i:origin[_-]?secret|aws[_-]?secret[_-]?access[_-]?key|api[_-]?key|access[_-]?token|password)\s*["\']?\s*[:=]\s*["\'][A-Za-z0-9+/=_-]{20,200}["\']'),
    'private-ip': re.compile(rb'(?<![\d.])(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})(?![\d.])'),
}


def reviewed(path, category, binary):
    if path == 'tools/release/scrub.py':
        return 'Audit rule definitions; no private operational content.'
    if category == 'home-path-or-account' and path.startswith('phone/public/face-detector/wasm/'):
        return 'Unchanged upstream runtime build paths and virtual filesystem, not local project accounts.'
    if category == 'email' and path.endswith('LilitaOne-OFL.txt'):
        return 'Public font-author copyright notice; preserve required attribution.'
    if category == 'email' and path.endswith(('pnpm-lock.yaml', 'package-lock.json')):
        return 'Public dependency author metadata embedded in package specifiers.'
    if category == 'email' and path == 'relay/test/services.test.ts':
        return 'Synthetic credential-rejection URL in the reserved example.com domain.'
    if category == 'email' and path == 'tools/release/package.test.mjs':
        return 'Generated test Git identity using the reserved example.invalid domain.'
    if category == 'internal-reference' and path == 'DECISIONS.md':
        return 'Append-only public-repo policy prohibiting private coordination notes.'
    if category == 'internal-reference' and path == 'docs/workers/release-prep.md':
        return 'Search terms in the public-tree scrub instructions.'
    if category == 'internal-reference' and binary and path == 'docs/review/voice-wav/web-lobby-speaking.png':
        return 'Compressed image bytes can coincidentally match short words; inspect metadata separately.'
    return None


def inventory():
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')) - {''}
    tracked = {p for p in tracked if 'notes' not in Path(p).parts and '.git' not in Path(p).parts}
    visible = set(subprocess.check_output(['rg', '--files', '--hidden', '-g', '!.git', '-g', '!notes', '-g', '!node_modules'], cwd=ROOT).decode().splitlines())
    visible = {p for p in visible if not any(part in SKIP for part in Path(p).parts)}
    env_files = []
    for directory, dirs, files in os.walk(ROOT, followlinks=False):
        dirs[:] = [d for d in dirs if d not in SKIP and not (Path(directory) / d).is_symlink()]
        env_files.extend(str((Path(directory) / f).relative_to(ROOT)) for f in files if f == '.env' or f.startswith('.env.'))
    return sorted(tracked | visible | set(env_files)), tracked, sorted(env_files)


def audit():
    paths, tracked, env_files = inventory()
    findings = []
    text_count = binary_count = 0
    for path in paths:
        file = ROOT / path
        if not file.is_file() or file.is_symlink():
            continue
        data = file.read_bytes()
        binary = b'\0' in data[:8192]
        binary_count += int(binary)
        text_count += int(not binary)
        for category, rule in RULES.items():
            if binary and category not in ('home-path-or-account', 'key-or-token', 'internal-reference'):
                continue
            matches = list(rule.finditer(data))
            if matches:
                findings.append({
                    'path': path, 'category': category, 'count': len(matches),
                    'lines': sorted({data.count(b'\n', 0, m.start()) + 1 for m in matches}),
                    'reviewed': reviewed(path, category, binary),
                })
    for path in env_files:
        if path in tracked:
            findings.append({'path': path, 'category': 'tracked-env', 'count': 1, 'lines': [], 'reviewed': None})
    return {
        'scope': 'Current first-party tree, no history/notes/dependencies/generated caches; values never emitted.',
        'trackedFiles': len(tracked), 'textFilesScanned': text_count, 'binaryFilesScanned': binary_count,
        'envFiles': env_files, 'findings': findings,
        'unreviewedFindings': sum(not finding['reviewed'] for finding in findings),
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true', help='Emit paths/categories/lines/counts only, never matched values.')
    args = parser.parse_args()
    result = audit()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Scanned {result['textFilesScanned']} text and {result['binaryFilesScanned']} binary files; {result['unreviewedFindings']} findings need review; {len(result['envFiles'])} .env files.")
        for finding in result['findings']:
            if not finding['reviewed']:
                print(f"{finding['category']}: {finding['path']} (lines {','.join(map(str, finding['lines']))}; {finding['count']} matches)")
    raise SystemExit(int(bool(result['unreviewedFindings'])))
