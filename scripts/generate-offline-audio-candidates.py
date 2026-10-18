"""Produce isolated, traceable Kokoro samples; never replace application media."""
import argparse
import datetime
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from audio_candidate_processing import finalize, word_boundary, render_review, SOURCE_BYTES as PROCESSOR_SOURCE

ROOT = Path(__file__).resolve().parents[1]
GENERATOR_SOURCE = Path(__file__).read_bytes()
REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
REVISION = '01e7505bd6a7a2ac4975463114c3a7650a9f7218'
MODEL_HASH = 'b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b'
WEIGHTS = 'kokoro-v1_1-zh.pth'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--only', nargs='+', default=['zh-seat', 'seat', 'wheel', 'roof', 'phrase-wheel', 'welcome', 'name-CAR01', 'name-CAR03', 'name-CAR06'])
parser.add_argument('--zh-voices', nargs='+', default=['zf_001', 'zf_008'])
parser.add_argument('--en-voices', nargs='+')
parser.add_argument('--model-variant', choices=['bilingual', 'english'], default='bilingual')
parser.add_argument('--short-word-context', action='store_true', help='Synthesize a carrier sentence, then isolate its final word using timing and a measured quiet separator')
parser.add_argument('--output', type=Path)
parser.add_argument('--pronunciations', type=Path, help='Explicit candidate-only spoken forms; display text stays unchanged')
parser.add_argument('--plan', action='store_true')
args = parser.parse_args()
if args.model_variant == 'english':
    REPO, REVISION, MODEL_HASH, WEIGHTS = 'hexgrad/Kokoro-82M', 'f3ff3571791e39611d31c381e3a41a3af07b4987', '496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4', 'kokoro-v1_0.pth'
args.en_voices = args.en_voices or (['af_heart', 'af_bella'] if args.model_variant == 'english' else ['af_maple', 'af_sol'])
content = json.loads((ROOT / 'content/r3.json').read_text())
pronunciations = json.loads(args.pronunciations.read_text())['overrides'] if args.pronunciations else {}
if any(key not in content['speech'] or entry['expectedText'] != content['speech'][key]['text'] or not entry['spokenText'].strip() for key, entry in pronunciations.items()):
    parser.error('Unknown or stale pronunciation override')
if len(set(args.only)) != len(args.only) or any(key not in content['speech'] or not re.fullmatch(r'[\w-]+', key) for key in args.only):
    parser.error('Unknown, duplicated or unsafe clip ID')
if args.short_word_context and any(content['speech'][key]['locale'] != 'en-US' or not content['speech'][key]['text'].isalpha() for key in args.only):
    parser.error('Context extraction only supports individual English words')
if args.model_variant == 'english' and any(content['speech'][key]['locale'] != 'en-US' for key in args.only):
    parser.error('The English pilot variant only accepts English source clips')
voices = (args.zh_voices if any(content['speech'][key]['locale'] == 'zh-CN' for key in args.only) else []) + (args.en_voices if any(content['speech'][key]['locale'] == 'en-US' for key in args.only) else [])
allowed_english = ['af_heart', 'af_bella'] if args.model_variant == 'english' else ['af_maple', 'af_sol']
if len(set(voices)) != len(voices) or any(not re.fullmatch(r'zf_\d{3}', voice) for voice in args.zh_voices) or any(voice not in allowed_english for voice in args.en_voices):
    parser.error('Use named voices from the selected pinned model')
plan = {'model': REPO, 'revision': REVISION, 'sourceContentReleaseId': content['id'], 'inputs': len(args.only), 'candidates': sum(len(args.zh_voices if content['speech'][key]['locale'] == 'zh-CN' else args.en_voices) for key in args.only), 'pronunciationOverrides': {key: entry for key, entry in pronunciations.items() if key in args.only}, 'shortWordContext': args.short_word_context, 'applicationMediaReplaced': False}
print(json.dumps(plan, ensure_ascii=False), flush=True)
if args.plan:
    raise SystemExit(0)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
output = (args.output or ROOT / '.release-artifacts/tts-candidates' / ('kokoro-' + stamp)).resolve()
if output == ROOT or ROOT in output.parents and (ROOT / '.release-artifacts') not in output.parents:
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
(output / 'source').mkdir()
(output / 'source' / 'generate-offline-audio-candidates.py').write_bytes(GENERATOR_SOURCE)
(output / 'source' / 'audio_candidate_processing.py').write_bytes(PROCESSOR_SOURCE)
if args.short_word_context: (output / 'contexts').mkdir()

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

config, weights = fetch('config.json'), fetch(WEIGHTS)
card = fetch('README.md')
if 'license: apache-2.0' not in card.read_text():
    raise RuntimeError('Pinned model license declaration changed')
voice_files = {voice: fetch(f'voices/{voice}.pt') for voice in voices}
model = KModel(repo_id=REPO, config=str(config), model=str(weights)).to('cpu').eval()
english = KPipeline(lang_code='a', repo_id=REPO, model=False)
def phonemize_english(text):
    return ' '.join(part.phonemes for part in english(text))
chinese = KPipeline(lang_code='z', repo_id=REPO, model=model, en_callable=phonemize_english)
report = {**plan, 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'generatorSha256': hashlib.sha256(GENERATOR_SOURCE).hexdigest(), 'modelFiles': model_files, 'licenseDeclaredByPublisher': 'Apache-2.0', 'licenseSource': f'https://huggingface.co/{REPO}/blob/{REVISION}/README.md', 'humanListeningCompleted': False, 'distributionApproved': False, 'audioUploaded': False, 'python': sys.version.split()[0], 'packages': json.loads(subprocess.check_output([sys.executable, '-m', 'pip', 'list', '--format=json'], text=True)), 'clips': []}
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
    synthesis_text = pronunciations.get(clip_id, {}).get('spokenText', line['text'])
    if args.short_word_context: synthesis_text = 'Listen carefully to this word. ' + line['text'].lower() + '.'
    for voice in args.zh_voices if zh else args.en_voices:
        speed = .95 if zh else .9
        pipeline = chinese if zh else english
        chunks = list(pipeline(synthesis_text, voice=str(voice_files[voice]), speed=speed, model=model))
        if not chunks or any(chunk.audio is None or not len(chunk.audio) for chunk in chunks):
            raise RuntimeError('Missing synthesized speech: ' + clip_id)
        samples = np.concatenate([chunk.audio.detach().cpu().numpy() for chunk in chunks])
        filename = f'{clip_id}--{voice}'
        raw, mp3 = output / 'raw' / (filename + '.wav'), output / (filename + '.mp3')
        extraction = None
        if args.short_word_context:
            if len(chunks) != 1 or not chunks[0].tokens: raise RuntimeError('No single aligned context chunk')
            token = next((token for token in reversed(chunks[0].tokens) if token.text.lower() == line['text'].lower()), None)
            if token is None or token.start_ts is None or token.end_ts is None: raise RuntimeError('No aligned final word')
            context_file = output / 'contexts' / (filename + '.wav')
            sf.write(context_file, samples, 24000, subtype='PCM_16')
            cut, extraction = word_boundary(samples, 24000, token.start_ts)
            extraction.update(modelEndSeconds=token.end_ts, targetPhonemes=token.phonemes, contextPath='contexts/' + context_file.name, contextSha256=hashlib.sha256(context_file.read_bytes()).hexdigest())
            samples = samples[cut:]
        sf.write(raw, samples, 24000, subtype='PCM_16')
        processing, duration = finalize(raw, mp3)
        record = {'id': clip_id, 'voice': voice, 'speed': speed, 'text': line['text'], 'synthesisText': synthesis_text, 'contextExtraction': extraction, 'locale': line['locale'], 'textSha256': hashlib.sha256(line['text'].encode()).hexdigest(), 'phonemes': [chunk.phonemes for chunk in chunks], 'graphemes': [chunk.graphemes for chunk in chunks], 'path': mp3.name, 'sha256': hashlib.sha256(mp3.read_bytes()).hexdigest(), 'rawSha256': hashlib.sha256(raw.read_bytes()).hexdigest(), 'baselineSha256': asset['sha256'], 'durationSeconds': duration, 'processing': processing, 'listeningStatus': 'not-reviewed'}
        report['clips'].append(record); save()
        print(f'{clip_id}/{voice}: {duration:.2f}s, decoded and saved', flush=True)
render_review(report, output)
report['status'] = 'generated-pending-audit'; save()
print(str(output), flush=True)
