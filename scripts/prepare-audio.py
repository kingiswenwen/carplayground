"""Conservative endpoint silence trimming and level matching; speech is unchanged."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true', help='Write reviewed technical transformations; originals remain in baseline Git commit')
parser.add_argument('--only', nargs='+', help='Process only these clip IDs; retain previous processing records')
args = parser.parse_args()
content = json.loads((ROOT / 'content/r3.json').read_text())
audit = json.loads((ROOT / 'docs/development/audio-technical-audit.json').read_text())
if audit['contentReleaseId'] != content['id']:
    raise SystemExit('Run the audio audit for the current content first.')
previous = {c['id']: c for c in audit['clips']}
records = []
ids = args.only or list(content['speech'])
if any(clip_id not in content['speech'] for clip_id in ids):
    raise SystemExit('Unknown clip ID')
production_path = ROOT / 'content/audio-production.json'
production = json.loads(production_path.read_text()) if production_path.exists() else {'formatVersion': 1, 'clips': {}}
for clip_id in ids:
    asset = next(a for a in content['assets'] if a['id'] == clip_id)
    source = ROOT / 'public' / asset['path']
    original = source.read_bytes()
    input_hash = hashlib.sha256(original).hexdigest()
    metrics = previous[clip_id]
    if input_hash != metrics['sha256']:
        raise SystemExit(f'Stale audio audit for {clip_id}')
    scan = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(source), '-af', 'silencedetect=noise=-50dB:d=0.15', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    # Only remove silence at the two endpoints. Internal sentence pauses remain.
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', scan.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', scan.stderr)]
    duration = metrics['durationSeconds']
    begin = max(0, ends[0] - .12) if starts and starts[0] < .01 and ends else 0
    end = min(duration, starts[-1] + .28) if starts and ends and abs(ends[-1] - duration) < .1 and duration - starts[-1] > .6 else duration
    if end - begin < .3:
        raise RuntimeError(f'Unexpected speech region for {clip_id}; not trimming')
    gain = min(-20 - metrics['integratedLufs'], -3 - metrics['truePeakDbtp'])
    gain = round(max(-6, min(6, gain)), 2)
    producer = production['clips'].get(clip_id)
    if producer and producer.get('currentAudioSha256', producer['audioSha256']) != input_hash:
        raise RuntimeError('Production provenance differs from input audio: ' + clip_id)
    record = {'id': clip_id, 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'sourceContentReleaseId': content['id'], 'inputSha256': input_hash, 'trimStartSeconds': round(begin, 4), 'trimEndSeconds': round(end, 4), 'gainDb': gain, 'targetIntegratedLufs': -20, 'peakCeilingDbtp': -3, 'listeningStatus': 'not-reviewed'}
    if args.apply:
        with tempfile.NamedTemporaryFile(dir=source.parent, suffix='.mp3', delete=False) as temporary:
            output = Path(temporary.name)
        try:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-af', f'atrim=start={begin}:end={end},asetpts=PTS-STARTPTS,volume={gain}dB', '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', str(output)], check=True, capture_output=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(output), '-f', 'null', '-'], check=True, capture_output=True)
            record['outputSha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
            output.replace(source)
            if producer:
                producer['currentAudioSha256'] = record['outputSha256']
                producer.setdefault('processing', []).append(dict(record))
        finally:
            output.unlink(missing_ok=True)
    records.append(record)
if args.apply:
    processing_path = ROOT / 'content/audio-processing.json'
    existing = json.loads(processing_path.read_text()) if processing_path.exists() else {}
    merged = {clip['id']: clip for clip in existing.get('clips', [])}
    for clip in merged.values():
        clip.setdefault('sourceCommit', existing.get('sourceBaselineCommit'))
        clip.setdefault('sourceContentReleaseId', existing.get('sourceContentReleaseId'))
    for clip in records:
        if clip['id'] in merged:
            clip['previousTransform'] = merged[clip['id']]
        merged[clip['id']] = clip
    report = {**existing, 'latestProcessingAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'tool': subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True).stdout.splitlines()[0], 'policy': 'Only leading/trailing measured silence; retain 120 ms lead and 280 ms tail where trimmed. Internal pauses and words unchanged. Gain targets -20 LUFS while reserving 3 dB peak headroom. Technical transformation is not a listening or rights approval.', 'clips': list(merged.values())}
    processing_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    production_path.write_text(json.dumps(production, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'clips': len(records), 'endpointTrimmed': sum(c['trimStartSeconds'] > .01 or c['trimEndSeconds'] < previous[c['id']]['durationSeconds'] - .01 for c in records), 'applied': args.apply}))
