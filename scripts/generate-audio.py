"""制作期 Edge 本地预览工具；不据此批准公开分发，不进入客户端依赖。"""
import argparse
import asyncio
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--preview-only', action='store_true', required=True)
parser.add_argument('--only', nargs='+')
args = parser.parse_args()
SPEECH = json.loads((ROOT / 'content/r3.json').read_text())['speech']
ids = args.only or list(SPEECH)
if any(i not in SPEECH or not re.fullmatch(r'[A-Za-z0-9_-]+', i) for i in ids):
    parser.error('Unknown or unsafe clip ID')
provenance_path = ROOT / 'content/audio-production.json'
provenance = json.loads(provenance_path.read_text()) if provenance_path.exists() else {'formatVersion': 1, 'clips': {}}

async def main():
    semaphore = asyncio.Semaphore(3)
    async def make(clip_id):
        line = SPEECH[clip_id]
        target = ROOT / 'public/media' / f'{clip_id}.mp3'
        if target.exists() and target.stat().st_size > 0:
            record = provenance['clips'].get(clip_id)
            if record and record['text'] != line['text']:
                raise RuntimeError(f'{clip_id}: existing audio has different production text; not silently reusing it')
            return
        voice = 'zh-CN-XiaoxiaoNeural' if line['locale'] == 'zh-CN' else 'en-US-JennyNeural'
        async with semaphore:
            with tempfile.NamedTemporaryFile(dir=target.parent, suffix='.mp3', delete=False) as temporary:
                staged = Path(temporary.name)
            try:
                await edge_tts.Communicate(line['text'], voice, rate='-12%').save(str(staged))
                subprocess.run(['ffmpeg', '-v', 'error', '-i', str(staged), '-f', 'null', '-'], check=True, capture_output=True)
                audio = staged.read_bytes()
                staged.replace(target)
            finally:
                staged.unlink(missing_ok=True)
            provenance['clips'][clip_id] = {'provider': 'edge-preview', 'generatorVersion': 'edge-tts ' + edge_tts.__version__, 'voice': voice, 'rate': '-12%', 'text': line['text'], 'locale': line['locale'], 'textSha256': hashlib.sha256(line['text'].encode()).hexdigest(), 'audioSha256': hashlib.sha256(audio).hexdigest(), 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'listeningStatus': 'not-reviewed', 'distributionReview': 'unverified-local-preview-only'}
            print(clip_id + ': local preview generated; distribution review remains unverified', flush=True)
    try:
        await asyncio.gather(*(make(clip_id) for clip_id in ids))
    finally:
        provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')

asyncio.run(main())
