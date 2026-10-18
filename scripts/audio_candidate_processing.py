"""Endpoint-only candidate processing, reusable during synthesis or on saved WAVs."""
import argparse
import datetime
import hashlib
import html
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
SOURCE_BYTES = Path(__file__).read_bytes()

def render_review(report, output):
    rows = []
    for clip_id in dict.fromkeys(clip['id'] for clip in report['clips']):
        clips = [clip for clip in report['clips'] if clip['id'] == clip_id]
        players = []
        for clip in clips:
            player = f'<div><b>{html.escape(clip["voice"])} <small>{clip["durationSeconds"]:.2f}秒</small></b><audio controls preload="metadata" aria-label="候选 {html.escape(clip["voice"])}" src="{html.escape(clip["path"])}"></audio></div>'
            context = clip.get('contextExtraction')
            if context:
                player += f'<details><summary>核对完整合成句子</summary><audio controls preload="metadata" src="{html.escape(context["contextPath"])}"></audio></details>'
            players.append(player)
        baseline_duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(output / 'baseline' / (clip_id + '.mp3'))], text=True))
        rows.append(f'<section><h2>{html.escape(clip_id)}</h2><p>{html.escape(clips[0]["text"])}</p><div><b>当前Edge预览 <small>{baseline_duration:.2f}秒</small></b><audio controls preload="metadata" src="baseline/{html.escape(clip_id)}.mp3"></audio></div>' + ''.join(players) + '</section>')
    markup = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>语音候选核对</title><style>body{max-width:900px;margin:32px auto;padding:16px;font:18px sans-serif;background:#f8f7f0;color:#243b34}section{border-top:1px solid #ccd6ca;padding:20px 0}section div{display:flex;gap:20px;align-items:center;margin:12px 0}b{min-width:150px}audio{max-width:100%}details{margin:12px 0}@media(max-width:500px){section div{display:block}}</style><h1>汽车游乐园 · 语音候选</h1><p>本地对照，未真人听审，未替换当前版本。逐一播放检查完整性、短词、车型名、节奏和音量。</p>' + ''.join(rows) + '<script>document.addEventListener("play",event=>{for(const audio of document.querySelectorAll("audio"))if(audio!==event.target)audio.pause()},true)</script></html>'
    (output / 'index.html').write_text(markup)

def word_boundary(samples, rate, estimated_start):
    """Require a quiet separator near model timing before extracting a final word."""
    step = rate // 100
    lower = max(0, int((estimated_start - .5) * rate))
    upper = min(len(samples), int((estimated_start + .08) * rate))
    gaps, beginning = [], None
    for offset in range(lower, upper, step):
        frame = samples[offset:min(offset + step, upper)]
        quiet = math.sqrt(sum(float(value) ** 2 for value in frame) / len(frame)) < .0032
        if quiet and beginning is None: beginning = offset
        if not quiet and beginning is not None:
            if offset - beginning >= .04 * rate: gaps.append((beginning, offset))
            beginning = None
    if beginning is not None and upper - beginning >= .04 * rate: gaps.append((beginning, upper))
    if not gaps: raise RuntimeError('No safe quiet boundary near the final word')
    begin, end = min(gaps, key=lambda gap: abs(gap[1] / rate - estimated_start))
    cut = max(begin, end - int(.12 * rate))
    return cut, {'modelStartSeconds': estimated_start, 'quietGapSeconds': [begin / rate, end / rate], 'cutStartSeconds': cut / rate}

def finalize(raw, target):
    scan = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(raw), '-af', 'loudnorm=I=-20:TP=-3:LRA=11:print_format=json,silencedetect=noise=-50dB:d=0.15', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    measured = json.loads(re.search(r'\{\s*"input_i".*?\}', scan.stderr, re.S).group())
    loudness, peak = float(measured['input_i']), float(measured['input_tp'])
    if not math.isfinite(loudness) or not math.isfinite(peak):
        raise RuntimeError('No measurable speech')
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(raw)], text=True))
    starts = [float(value) for value in re.findall(r'silence_start: ([\d.]+)', scan.stderr)]
    ends = [float(value) for value in re.findall(r'silence_end: ([\d.]+)', scan.stderr)]
    begin = max(0, ends[0] - .12) if starts and ends and starts[0] < .01 else 0
    end = min(duration, starts[-1] + .28) if starts and ends and abs(ends[-1] - duration) < .1 and duration - starts[-1] > .4 else duration
    if end - begin < .25:
        raise RuntimeError('Unexpectedly short speech region; refusing to trim')
    gain = round(max(-12, min(12, -20 - loudness, -3 - peak)), 2)
    filters = f'atrim=start={begin}:end={end},asetpts=PTS-STARTPTS,volume={gain}dB'
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(raw), '-af', filters, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', str(target)], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(target), '-f', 'null', '-'], check=True, capture_output=True)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(target)], text=True))
    return {'filters': filters, 'inputLufs': loudness, 'inputTruePeak': peak, 'targetLufs': -20, 'sampleRate': 24000, 'channels': 1, 'trimStartSeconds': begin, 'trimEndSeconds': end, 'processingScriptSha256': hashlib.sha256(SOURCE_BYTES).hexdigest()}, duration

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('parent', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    parent, output = args.parent.resolve(), args.output.resolve()
    root = Path(__file__).resolve().parents[1]
    if output == root or root in output.parents and (root / '.release-artifacts') not in output.parents:
        parser.error('Repository output must be under .release-artifacts')
    report = json.loads((parent / 'generation.json').read_text())
    if report.get('status') != 'generated-pending-audit' or len(report['clips']) != report['candidates']:
        parser.error('Parent generation is incomplete')
    output.mkdir(parents=True, exist_ok=False)
    (output / 'raw').mkdir(); (output / 'baseline').mkdir()
    (output / 'source').mkdir()
    (output / 'source' / 'audio_candidate_processing.py').write_bytes(SOURCE_BYTES)
    if (parent / 'source').exists(): shutil.copytree(parent / 'source', output / 'source' / 'parent')
    for clip in report['clips']:
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.mp3', clip['path']):
            raise RuntimeError('Unsafe candidate path')
        raw = parent / 'raw' / (Path(clip['path']).stem + '.wav')
        if hashlib.sha256(raw.read_bytes()).hexdigest() != clip['rawSha256']:
            raise RuntimeError('Raw waveform differs from parent generation')
        target = output / clip['path']
        processing, duration = finalize(raw, target)
        clip.update(priorProcessing=clip['processing'], processing=processing, durationSeconds=duration, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
        shutil.copyfile(raw, output / 'raw' / raw.name)
        baseline = parent / 'baseline' / (clip['id'] + '.mp3')
        if hashlib.sha256(baseline.read_bytes()).hexdigest() != clip['baselineSha256']:
            raise RuntimeError('Baseline differs from parent generation')
        if not (output / 'baseline' / baseline.name).exists(): shutil.copyfile(baseline, output / 'baseline' / baseline.name)
        print(clip['path'] + f': same raw WAV, endpoint-processed {duration:.2f}s', flush=True)
    report['postprocessing'] = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'parentGenerationSha256': hashlib.sha256((parent / 'generation.json').read_bytes()).hexdigest(), 'scriptSha256': hashlib.sha256(SOURCE_BYTES).hexdigest(), 'parentSourceSnapshotAvailable': (parent / 'source').exists(), 'policy': 'Retain 120ms leading and 280ms trailing silence where trimming; internal pauses unchanged; no resynthesis'}
    (output / 'generation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    render_review(report, output)
