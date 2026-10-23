"""Summarize complete measured windows after the benchmark's settling period."""
from datetime import datetime, timedelta
from pathlib import Path
import json
import statistics

root=Path(__file__).resolve().parents[2]
evidence=root/'docs/spike/evidence'
records=[json.loads(line) for line in (evidence/'runtime.jsonl').read_text().splitlines()]
blocks=json.loads((evidence/'benchmark-blocks.json').read_text())
summary=[]
for name in ['baseline','rays','particles300','sprites20','full20','full40']:
    samples=[]
    for block in blocks:
        if block['case']!=name:
            continue
        settled=datetime.fromisoformat(block['start'])+timedelta(seconds=4)
        finished=datetime.fromisoformat(block['end'])
        for record in records:
            if (record['kind']!='perf' or record['case']!=name or
                not record.get('clock','').startswith('JS rAF')):
                continue
            end=datetime.fromisoformat(record['hostTime'].replace('Z','+00:00'))
            start=end-timedelta(seconds=record['seconds'])
            if settled<=start and end<=finished:
                samples.append(record)
    if not samples:
        raise RuntimeError(f'No complete windows for {name}')
    row={'case':name,'n':len(samples),
         'median_js_updates':statistics.median(r['fps'] for r in samples),
         'min_js_updates':min(r['fps'] for r in samples),
         'median_p95_ms':statistics.median(r['p95'] for r in samples)}
    summary.append(row)
    print(json.dumps(row))
(evidence/'benchmark-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
