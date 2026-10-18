"""Produce isolated, traceable Kokoro samples; never replace application media."""
import argparse
import datetime
import hashlib
import html
import importlib.metadata
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
REVISION = '01e7505bd6a7a2ac4975463114c3a7650a9f7218'
MODEL_HASH = 'b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--only', nargs='+', default=['zh-seat', 'seat', 'wheel', 'roof', 'phrase-wheel', 'welcome', 'name-CAR01', 'name-CAR03', 'name-CAR06'])
parser.add_argument('--zh-voices', nargs='+', default=['zf_001', 'zf_008'])
parser.add_argument('--en-voices', nargs='+', default=['af_maple', 'af_sol'])
parser.add_argument('--output', type=Path)
parser.add_argument('--plan', action='store_true')
args = parser.parse_args()
content = json.loads((ROOT / 'content/r3.json').read_text())
if len(set(args.only)) != len(args.only) or any(key not in content['speech'] or not re.fullmatch(r'[\w-]+', key) for key in args.only):
    parser.error('Unknown, duplicated or unsafe clip ID')
voices = args.zh_voices + args.en_voices
if len(set(voices)) != len(voices) or any(not re.fullmatch(r'zf_\d{3}', voice) for voice in args.zh_voices) or any(voice not in ['af_maple', 'af_sol'] for voice in args.en_voices):
    parser.error('Use named voices from the pinned bilingual model')
plan = {'model': REPO, 'revision': REVISION, 'sourceContentReleaseId': content['id'], 'inputs': len(args.only), 'candidates': sum(len(args.zh_voices if content['speech'][key]['locale'] == 'zh-CN' else args.en_voices) for key in args.only), 'applicationMediaReplaced': False}
print(json.dumps(plan, ensure_ascii=False), flush=True)
if args.plan:
    raise SystemExit(0)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
output = (args.output or ROOT / '.release-artifacts/tts-candidates' / ('kokoro-' + stamp)).resolve()
if output == ROOT or ROOT in output.parents and '.release-artifacts' not in output.relative_to(ROOT).parts:
    parser.error('Candidate output inside the repository must be in .release-artifacts')
if output.exists():
    parser.error('Refusing to overwrite an existing candidate directory')
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_XET'] = '1'
from huggingface_hub import HfApi, hf_hub_download
from kokoro import KModel, KPipeline
import numpy as np
import soundfile as sf
import torch

output.mkdir(parents=True, exist_ok=False)
(output / 'raw').mkdir()
(output / 'baseline').mkdir()

torch.set_num_threads(2)
torch.set_num_interop_threads(1)
cache = Path.home() / '.cache/carplayground-kokoro-models'
info = HfApi(token=False).model_info(REPO, revision=REVISION, files_metadata=True)
assert info.sha == REVISION
metadata = {file.rfilename: file for file in info.siblings}
model_files = {}
def fetch(name):
    path = Path(hf_hub_download(REPO, filename=name, revision=REVISION, token=False, cache_dir=cache))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    expected = metadata[name].lfs.sha256 if metadata[name].lfs else None
    if expected and digest != expected:
        raise RuntimeError('Downloaded file hash mismatch: ' + name)
    if name.endswith('.pth') and digest != MODEL_HASH:
        raise RuntimeError('Model differs from the author-published SHA-256')
    model_files[name] = {'sha256': digest, 'bytes': path.stat().st_size, 'lfsHashVerified': expected is not None}
    return path

config, weights = fetch('config.json'), fetch('kokoro-v1_1-zh.pth')
card = fetch('README.md')
if 'license: apache-2.0' not in card.read_text():
    raise RuntimeError('Pinned model license declaration changed')
voice_files = {voice: fetch(f'voices/{voice}.pt') for voice in voices}
model = KModel(repo_id=REPO, config=str(config), model=str(weights)).to('cpu').eval()
english = KPipeline(lang_code='a', repo_id=REPO, model=False)
def phonemize_english(text):
    return ' '.join(part.phonemes for part in english(text))
chinese = KPipeline(lang_code='z', repo_id=REPO, model=model, en_callable=phonemize_english)
report = {**plan, 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'generatorSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'modelFiles': model_files, 'licenseDeclaredByPublisher': 'Apache-2.0', 'licenseSource': f'https://huggingface.co/{REPO}/blob/{REVISION}/README.md', 'humanListeningCompleted': False, 'distributionApproved': False, 'audioUploaded': False, 'python': sys.version.split()[0], 'packages': json.loads(subprocess.check_output([sys.executable, '-m', 'pip', 'list', '--format=json'], text=True)), 'clips': []}
def save():
    (output / 'generation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
save()
for clip_id in args.only:
    line = content['speech'][clip_id]
    asset = next(asset for asset in content['assets'] if asset['id'] == clip_id and asset['kind'] == 'audio')
    baseline = ROOT / 'public' / asset['path']
    if hashlib.sha256(baseline.read_bytes()).hexdigest() != asset['sha256']:
        raise RuntimeError('Baseline audio differs from content: ' + clip_id)
    shutil.copyfile(baseline, output / 'baseline' / (clip_id + '.mp3'))
    zh = line['locale'] == 'zh-CN'
    for voice in args.zh_voices if zh else args.en_voices:
        speed = .95 if zh else .9
        pipeline = chinese if zh else english
        chunks = list(pipeline(line['text'], voice=str(voice_files[voice]), speed=speed, model=model))
        if not chunks or any(chunk.audio is None or not len(chunk.audio) for chunk in chunks):
            raise RuntimeError('Missing synthesized speech: ' + clip_id)
        samples = np.concatenate([chunk.audio.detach().cpu().numpy() for chunk in chunks])
        filename = f'{clip_id}--{voice}'
        raw, mp3 = output / 'raw' / (filename + '.wav'), output / (filename + '.mp3')
        sf.write(raw, samples, 24000, subtype='PCM_16')
        scan = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(raw), '-af', 'loudnorm=I=-20:TP=-3:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
        measured = json.loads(re.search(r'\{\s*"input_i".*?\}', scan.stderr, re.S).group())
        loudness, peak = float(measured['input_i']), float(measured['input_tp'])
        if not math.isfinite(loudness) or not math.isfinite(peak):
            raise RuntimeError('No measurable speech: ' + clip_id)
        gain = round(max(-12, min(12, -20 - loudness, -3 - peak)), 2)
        filters = f'volume={gain}dB,adelay=120:all=1,apad=pad_dur=0.28'
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(raw), '-af', filters, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', str(mp3)], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(mp3), '-f', 'null', '-'], check=True, capture_output=True)
        duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(mp3)], text=True))
        record = {'id': clip_id, 'voice': voice, 'speed': speed, 'text': line['text'], 'locale': line['locale'], 'textSha256': hashlib.sha256(line['text'].encode()).hexdigest(), 'phonemes': [chunk.phonemes for chunk in chunks], 'graphemes': [chunk.graphemes for chunk in chunks], 'path': mp3.name, 'sha256': hashlib.sha256(mp3.read_bytes()).hexdigest(), 'rawSha256': hashlib.sha256(raw.read_bytes()).hexdigest(), 'baselineSha256': asset['sha256'], 'durationSeconds': duration, 'processing': {'filters': filters, 'inputLufs': loudness, 'inputTruePeak': peak, 'targetLufs': -20, 'sampleRate': 24000, 'channels': 1}, 'listeningStatus': 'not-reviewed'}
        report['clips'].append(record); save()
        print(f'{clip_id}/{voice}: {duration:.2f}s, decoded and saved', flush=True)
rows = []
for clip_id in args.only:
    clips = [clip for clip in report['clips'] if clip['id'] == clip_id]
    players = ''.join(f'<div><b>{html.escape(clip["voice"])}</b><audio controls preload="none" src="{html.escape(clip["path"])}"></audio></div>' for clip in clips)
    rows.append(f'<section><h2>{html.escape(clip_id)}</h2><p>{html.escape(content["speech"][clip_id]["text"])}</p><div><b>当前Edge预览</b><audio controls preload="none" src="baseline/{clip_id}.mp3"></audio></div>{players}</section>')
(output / 'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>语音候选核对</title><style>body{max-width:900px;margin:32px auto;padding:16px;font:18px sans-serif;background:#f8f7f0;color:#243b34}section{border-top:1px solid #ccd6ca;padding:20px 0}section div{display:flex;gap:20px;align-items:center;margin:12px 0}b{min-width:150px}audio{max-width:100%}@media(max-width:500px){section div{display:block}}</style><h1>汽车游乐园 · 语音候选</h1><p>本地对照，未真人听审，未替换当前版本。逐一播放检查完整性、短词、车型名、节奏和音量。</p>' + ''.join(rows) + '</html>')
report['status'] = 'generated-pending-audit'; save()
print(str(output), flush=True)
