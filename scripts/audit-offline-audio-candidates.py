"""Decode and locally transcribe isolated candidate audio, preserving the app audit."""
import argparse
import datetime
import difflib
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
args = parser.parse_args()
directory = args.directory.resolve()
generation = json.loads((directory / 'generation.json').read_text())
if generation.get('status') != 'generated-pending-audit' or len(generation['clips']) != generation['candidates']:
    parser.error('Generation is incomplete; audit the completed set')
content = json.loads((ROOT / 'content/r3.json').read_text())
baseline = json.loads((ROOT / 'docs/development/audio-transcript-audit.json').read_text())
baseline_by_id = {clip['id']: clip for clip in baseline['clips']}
config_path = Path.home() / '.cache/carplayground-kokoro-models/models--hexgrad--Kokoro-82M-v1.1-zh/snapshots' / generation['revision'] / 'config.json'
if hashlib.sha256(config_path.read_bytes()).hexdigest() != generation['modelFiles']['config.json']['sha256']:
    raise RuntimeError('Candidate synthesis vocabulary changed')
vocabulary = json.loads(config_path.read_text())['vocab']
model_directory = Path.home() / '.cache/carplayground-audio-asr-models/models--Systran--faster-whisper-base/snapshots' / baseline['modelRevision']
if hashlib.sha256((model_directory / 'model.bin').read_bytes()).hexdigest() != baseline['modelSha256']:
    raise RuntimeError('Local ASR model differs from baseline comparison model')
from faster_whisper import WhisperModel
import importlib.metadata
import numpy as np
model = WhisperModel(str(model_directory), device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, local_files_only=True)
def normalize(text):
    return ''.join(char.lower() for char in unicodedata.normalize('NFKC', text) if unicodedata.category(char)[0] in 'LN')
report = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Isolated candidate set only; normalized ASR differences are not confirmed synthesis errors. No listening or rights approval.', 'sourceContentReleaseId': generation['sourceContentReleaseId'], 'generationSha256': hashlib.sha256((directory / 'generation.json').read_bytes()).hexdigest(), 'asr': {'library': 'faster-whisper ' + importlib.metadata.version('faster-whisper'), 'model': baseline['model'], 'revision': baseline['modelRevision'], 'modelSha256': baseline['modelSha256'], 'method': 'Local CPU/int8; beam=3; locale-selected language; no expected-text prompt, no previous context, no VAD'}, 'humanListeningCompleted': False, 'distributionApproved': False, 'audioUploaded': False, 'clips': []}
for candidate in generation['clips']:
    name = candidate['path']
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.mp3', name):
        raise RuntimeError('Unsafe candidate audio path')
    path = (directory / name).resolve()
    if path.parent != directory or hashlib.sha256(path.read_bytes()).hexdigest() != candidate['sha256']:
        raise RuntimeError('Candidate file differs from generation: ' + name)
    current = content['speech'][candidate['id']]
    reference = baseline_by_id[candidate['id']]
    current_asset = next(asset for asset in content['assets'] if asset['id'] == candidate['id'] and asset['kind'] == 'audio')
    if current != {'text': candidate['text'], 'locale': candidate['locale']} or candidate['baselineSha256'] != reference['sha256'] or current_asset['sha256'] != reference['sha256'] or hashlib.sha256((ROOT / 'public' / current_asset['path']).read_bytes()).hexdigest() != reference['sha256']:
        raise RuntimeError('Candidate text or baseline has changed')
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]))
    stream = next(stream for stream in probe['streams'] if stream['codec_type'] == 'audio')
    measured = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(path), '-af', 'loudnorm=I=-20:TP=-3:LRA=11:print_format=json,silencedetect=noise=-45dB:d=0.2', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    values = json.loads(re.search(r'\{\s*"input_i".*?\}', measured.stderr, re.S).group())
    lufs, peak = float(values['input_i']), float(values['input_tp'])
    duration = float(probe['format']['duration'])
    issues = []
    unsupported = sorted({symbol for phonemes in candidate['phonemes'] for symbol in phonemes if symbol not in vocabulary and not symbol.isspace()})
    if unsupported: issues.append('unsupported-phonemes')
    if stream['codec_name'] != 'mp3' or int(stream['sample_rate']) != 24000 or stream['channels'] != 1: issues.append('unexpected-format')
    if not .25 <= duration <= 30: issues.append('duration-review')
    if not math.isfinite(lufs) or not -28 <= lufs <= -12: issues.append('loudness-review')
    if not math.isfinite(peak) or peak > -1: issues.append('peak-review')
    silence = [float(value) for value in re.findall(r'silence_duration: ([\d.]+)', measured.stderr)]
    if any(value > 1 for value in silence): issues.append('long-silence-review')
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'])
    segments, _ = model.transcribe(np.frombuffer(raw, dtype=np.float32), language='zh' if candidate['locale'] == 'zh-CN' else 'en', beam_size=3, condition_on_previous_text=False, vad_filter=False, no_speech_threshold=None)
    segments = list(segments)
    recognized = ''.join(segment.text for segment in segments).strip()
    expected, actual = normalize(candidate['text']), normalize(recognized)
    report['clips'].append({'id': candidate['id'], 'voice': candidate['voice'], 'path': name, 'sha256': candidate['sha256'], 'expected': candidate['text'], 'recognized': recognized, 'normalizedMatch': expected == actual, 'textSimilarity': round(difflib.SequenceMatcher(None, expected, actual).ratio(), 3), 'baselineRecognized': reference['recognized'], 'baselineNormalizedMatch': reference['normalizedMatch'], 'durationSeconds': duration, 'sampleRate': int(stream['sample_rate']), 'channels': stream['channels'], 'integratedLufs': lufs if math.isfinite(lufs) else None, 'truePeakDbtp': peak if math.isfinite(peak) else None, 'silenceDurations': silence, 'unsupportedPhonemes': unsupported, 'technicalIssues': issues, 'listeningStatus': 'not-reviewed', 'segments': [{'text': segment.text, 'avgLogprob': segment.avg_logprob, 'noSpeechProbability': segment.no_speech_prob} for segment in segments]})
    (directory / 'audit.partial.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(candidate['id'] + '/' + candidate['voice'] + ': ' + recognized, flush=True)
report['summary'] = {'clips': len(report['clips']), 'decoded': len(report['clips']), 'withTechnicalIssues': sum(bool(clip['technicalIssues']) for clip in report['clips']), 'voices': [{'voice': voice, 'clips': sum(clip['voice'] == voice for clip in report['clips']), 'normalizedMatches': sum(clip['voice'] == voice and clip['normalizedMatch'] for clip in report['clips'])} for voice in sorted({clip['voice'] for clip in report['clips']})]}
(directory / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report['summary'], ensure_ascii=False), flush=True)
