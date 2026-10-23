#!/usr/bin/env python3
"""Inspect locally built VPKGs without extracting media. Python 3.14+ for Zstd tar.

Writes a numeric/public-config receipt; never emits matched credential values.
Run from anywhere: python3 tools/release/check-packages.py [output directory].
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import tarfile
import tomllib

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('public_scrub', ROOT / 'tools/release/scrub.py')
scrub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scrub)
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'dist/release'
manifest = json.loads((output / 'release-manifest.json').read_text())
checks = []
expected_targets = ['armv7', 'aarch64', 'x86_64']
assert [a['arch'] for a in manifest['artifacts']] == expected_targets
assert manifest['hermesFlags'] == ['-O', '-w', '-g0']
notices = {
    'LilitaOne-OFL.txt': ROOT / 'assets/fonts/LilitaOne-OFL.txt',
    'Rubik-OFL.txt': ROOT / 'assets/fonts/Rubik-OFL.txt',
    'PROJECT-LICENSE.txt': ROOT / 'LICENSE',
    **{name: ROOT / 'tools/release/licenses' / name for name in ['base-64-MIT.txt', 'qrcode-generator-MIT.txt', 'jpeg-js-BSD.txt', 'react-native-fast-image-PML.txt']},
}
for artifact in manifest['artifacts']:
    package = output / artifact['file']
    assert artifact['file'] == f"snagbrag_{artifact['arch']}.vpkg"
    assert hashlib.sha256(package.read_bytes()).hexdigest() == artifact['sha256']
    sdk = [p for p in (ROOT / 'tv/build').rglob(f"tv_{artifact['arch']}.vpkg") if 'Release' in p.parts]
    assert len(sdk) == 1 and hashlib.sha256(sdk[0].read_bytes()).hexdigest() == artifact['sha256']
    with tarfile.open(package) as archive:
        for name, source in notices.items():
            assert archive.extractfile('assets/raw/' + name).read() == source.read_bytes(), name
        app = tomllib.loads(archive.extractfile('manifest.toml').read().decode())
        assert app['package']['id'] == 'com.snagbrag.tv'
        assert app['os']['version'] == {'min': '1.2', 'target': '1.2'}
        js = archive.extractfile('bundle/index.bundle').read()
        hermes = archive.extractfile('bundle/index.hermes.bundle').read()
        match = re.search(rb'var config = exports\.config = (\{.*?\});', js, re.S)
        assert match
        config = json.loads(match[1])
        assert config['relayUrl'] == manifest['relayUrl']
        assert all(config[key] is False for key in ('debug', 'offline', 'showcase', 'photoProbe'))
        for member in archive.getmembers():
            if not member.isfile():
                continue
            assert not Path(member.name).name.startswith('.env')
            assert not member.name.endswith(('.pem', '.key', '.map'))
            body = archive.extractfile(member).read()
            for category in ('home-path-or-account', 'key-or-token'):
                assert not scrub.RULES[category].search(body), (artifact['arch'], member.name, category)
        checks.append({
            'buildTarget': artifact['arch'], 'file': artifact['file'], 'bytes': artifact['bytes'], 'sha256': artifact['sha256'],
            'matchesSdkReleaseOutput': str(sdk[0].relative_to(ROOT)), 'noticesMatch': list(notices),
            'appId': app['package']['id'], 'vegaOs': '1.2', 'runtime': config, 'archiveEntries': len(archive.getmembers()),
            'homePathOrAccountSignatures': 0, 'keyOrTokenSignatures': 0,
            'jsBundleSha256': hashlib.sha256(js).hexdigest(), 'hermesBundleBytes': len(hermes),
        })
receipt = {
    'date': manifest['createdAt'].split('T')[0], 'outcome': 'PASS', 'sourceCommit': manifest['sourceCommit'],
    'architectureEvidence': 'Each explicit SDK target matches its fresh Release output. React Native uses system modules; the app-deployed FastImage helper releases native caches. Installation/hardware compatibility requires separate verification.',
    'endpointScope': 'Runtime fields record the baked URL. Hosted deployment and installation must be verified separately.',
    'hermesFlags': manifest['hermesFlags'], 'inspectionCreatesRelease': False,
    'checksumCommand': 'LC_ALL=C shasum -a 256 -c SHA256SUMS', 'checks': checks,
}
(ROOT / 'docs/release/packages.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(f'PASS all three VPKGs: hashes, SDK outputs, app/OS identity, runtime flags, {len(notices)} notices, no home/account/key signatures or source maps.')
