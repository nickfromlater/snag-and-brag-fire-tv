"""A/B native cases within one simulator session, with auditable time ranges.

Two counterbalanced passes, 24 seconds per case. Discard the first two 2-second
windows of each block. JS handler cadence is not display FPS. Use native trace
measurements alongside it and rerun this exact script on the physical stick.
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import subprocess
import time
from capture import command

root=Path(__file__).resolve().parents[2]
order=['baseline','rays','particles300','sprites20','full20','full40']
blocks=[]
for repeat, cases in enumerate([order, list(reversed(order))]):
    for name in cases:
        started=datetime.now(timezone.utc).isoformat()
        subprocess.run(['node',str(root/'spike/vega-app/control.cjs'),'case',name],check=True)
        print(f'Pass {repeat+1}: {name}',flush=True)
        time.sleep(8)
        if repeat==0:
            target=root/'spike/.cache/benchmark-shot'
            target.mkdir(exist_ok=True)
            command(f'screenrecord screenshot {target}')
            newest=max(target.glob('*.png'),key=lambda p:p.stat().st_mtime)
            newest.replace(root/f'docs/spike/shots/{name}.png')
        time.sleep(16)
        blocks.append({'repeat':repeat,'case':name,'start':started,
                       'end':datetime.now(timezone.utc).isoformat()})
        (root/'docs/spike/evidence/benchmark-blocks.json').write_text(json.dumps(blocks,indent=2)+'\n')
subprocess.run(['node',str(root/'spike/vega-app/control.cjs'),'case','full20'],check=True)
print('Benchmark complete',flush=True)
