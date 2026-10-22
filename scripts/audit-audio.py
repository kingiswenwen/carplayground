"""Decode and measure every current clip; this is not a listening approval."""
import concurrent.futures
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CONTENT = json.loads((ROOT / 'content/r3.json').read_text())

def inspect(item):
    clip_id, line = item
    asset = next(a for a in CONTENT['assets'] if a['id'] == clip_id and a['kind'] == 'audio')
    file = ROOT / 'public' / asset['path']
    issues = []
    data = file.read_bytes()
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(file)], capture_output=True, text=True, check=True)
    info = json.loads(probe.stdout)
    stream = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    measured = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(file), '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json,silencedetect=noise=-45dB:d=0.2', '-f', 'null', '-'], capture_output=True, text=True)
    loud = re.search(r'\{\s*"input_i".*?\}', measured.stderr, re.S)
    if measured.returncode or not loud:
        raise RuntimeError(f'无法完整解码或测量 {clip_id}')
    values = json.loads(loud.group())
    def number(key):
        value = float(values[key])
        return value if math.isfinite(value) else None
    duration = float(info['format']['duration'])
    lufs, peak = number('input_i'), number('input_tp')
    if hashlib.sha256(data).hexdigest() != asset['sha256']: issues.append('hash-mismatch')
    if abs(duration - asset['duration']) > 0.08: issues.append('duration-mismatch')
    if not 0.25 <= duration <= 30: issues.append('unexpected-duration')
    if stream['codec_name'] != 'mp3' or int(stream['sample_rate']) != 24000 or stream['channels'] != 1: issues.append('unexpected-format')
    if lufs is None: issues.append('no-measurable-loudness')
    elif not -28 <= lufs <= -12: issues.append('loudness-review')
    if peak is None or peak > -1: issues.append('peak-review')
    silences = [float(value) for value in re.findall(r'silence_duration: ([\d.]+)', measured.stderr)]
    if any(value > 1 for value in silences): issues.append('long-silence-review')
    return {'id': clip_id, 'text': line['text'], 'locale': line['locale'], 'sha256': asset['sha256'], 'durationSeconds': round(duration, 3), 'sampleRate': int(stream['sample_rate']), 'channels': stream['channels'], 'integratedLufs': lufs, 'truePeakDbtp': peak, 'silenceDurations': silences, 'issues': issues, 'listeningStatus': 'not-reviewed'}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    clips = list(pool.map(inspect, CONTENT['speech'].items()))
report = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'contentReleaseId': CONTENT['id'], 'scope': 'all current speech assets; local ffprobe/ffmpeg decoding and measurements', 'humanListeningCompleted': False, 'distributionRightsVerified': False, 'clips': clips, 'summary': {'clips': len(clips), 'decoded': len(clips), 'withIssues': sum(bool(c['issues']) for c in clips), 'loudnessRange': [min(c['integratedLufs'] for c in clips if c['integratedLufs'] is not None), max(c['integratedLufs'] for c in clips if c['integratedLufs'] is not None)]}}
output = ROOT / 'docs/development/audio-technical-audit.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report['summary'], ensure_ascii=False))
for clip in clips:
    if clip['issues']: print(clip['id'], clip['issues'], clip['integratedLufs'], clip['truePeakDbtp'])
