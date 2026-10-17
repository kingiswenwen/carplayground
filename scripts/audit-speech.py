"""Local, unprompted ASR comparison. Never substitutes for listening or rights."""
import argparse
import datetime
import difflib
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import unicodedata

os.environ.setdefault('HF_HUB_DISABLE_IMPLICIT_TOKEN', '1')
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
from huggingface_hub import HfApi, snapshot_download
from faster_whisper import WhisperModel
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--only', nargs='+')
parser.add_argument('--model', default='Systran/faster-whisper-base')
args = parser.parse_args()
content = json.loads((ROOT / 'content/r3.json').read_text())
output = ROOT / 'docs/development/audio-transcript-audit.json'
partial = ROOT / '.release-artifacts/audit/audio-transcript-audit.partial.json'
partial.parent.mkdir(parents=True, exist_ok=True)
previous_file = partial if partial.exists() else output
previous = json.loads(previous_file.read_text()) if previous_file.exists() else {}
info = HfApi(token=False).model_info(args.model)
cache = Path.home() / '.cache/carplayground-audio-asr-models'
model_path = snapshot_download(repo_id=args.model, revision=info.sha, token=False, cache_dir=cache, allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.*', 'preprocessor_config.json'])
print(f'Local ASR model: {args.model}@{info.sha}', flush=True)
model = WhisperModel(model_path, device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, local_files_only=True)
def normalize(text):
    return ''.join(char.lower() for char in unicodedata.normalize('NFKC', text) if unicodedata.category(char)[0] in 'LN')
existing = {c['id']: c for c in previous.get('clips', []) if c['id'] in content['speech']} if previous.get('modelRevision') == info.sha else {}
ids = args.only or sorted(content['speech'], key=lambda key: (not key.startswith('name-'), key))
if any(clip_id not in content['speech'] for clip_id in ids):
    raise SystemExit('Unknown clip ID')
report = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'contentReleaseId': content['id'], 'tool': 'faster-whisper '+importlib.metadata.version('faster-whisper'), 'model': args.model, 'modelRevision': info.sha, 'modelSha256': hashlib.sha256((Path(model_path) / 'model.bin').read_bytes()).hexdigest(), 'method': 'Local CPU/int8 ASR, language selected from clip locale, no expected-text prompt, no previous-clip context. Matching transcripts do not prove pronunciation or sound quality; mismatches may be recognizer errors or written/spoken variants.', 'humanListeningCompleted': False, 'audioUploaded': False, 'clips': []}
def save():
    report['clips'] = sorted(existing.values(), key=lambda clip: clip['id'])
    report['summary'] = {'transcribed': len(existing), 'normalizedMatches': sum(c['normalizedMatch'] for c in existing.values()), 'needsListening': sum(not c['normalizedMatch'] for c in existing.values())}
    partial.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
for index, clip_id in enumerate(ids):
    line = content['speech'][clip_id]
    asset = next(a for a in content['assets'] if a['id'] == clip_id and a['kind'] == 'audio')
    cached = existing.get(clip_id)
    if cached and cached['sha256'] == asset['sha256'] and cached['expected'] == line['text']:
        continue
    filename = ROOT / 'public' / asset['path']
    if hashlib.sha256(filename.read_bytes()).hexdigest() != asset['sha256']:
        raise RuntimeError(f'Current audio differs from manifest: {clip_id}')
    # Decode with the already audited FFmpeg runtime. This also avoids the
    # metadata_errors API mismatch between faster-whisper 1.2.1 and new PyAV.
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(filename), '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'])
    samples = np.frombuffer(raw, dtype=np.float32)
    segments, _ = model.transcribe(samples, language='zh' if line['locale'] == 'zh-CN' else 'en', beam_size=3, condition_on_previous_text=False, vad_filter=False, no_speech_threshold=None)
    segments = list(segments)
    transcript = ''.join(segment.text for segment in segments).strip()
    expected, actual = normalize(line['text']), normalize(transcript)
    existing[clip_id] = {'id': clip_id, 'sha256': asset['sha256'], 'expected': line['text'], 'recognized': transcript, 'locale': line['locale'], 'normalizedMatch': expected == actual, 'textSimilarity': round(difflib.SequenceMatcher(None, expected, actual).ratio(), 3), 'listeningStatus': 'not-reviewed', 'segments': [{'start': s.start, 'end': s.end, 'text': s.text, 'avgLogprob': s.avg_logprob, 'noSpeechProbability': s.no_speech_prob} for s in segments]}
    save()
    print(f'{index+1}/{len(ids)} {clip_id}: '+('text-match' if expected == actual else 'needs-listening'), flush=True)
save()
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report['summary'], ensure_ascii=False), flush=True)
