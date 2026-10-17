"""制作期 Azure Speech REST 客户端；仅从进程环境读取凭据，不进入网页。"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description='Generate traceable prebuilt-voice audio using an existing Azure Speech resource.')
parser.add_argument('--only', nargs='+', help='Only these clip IDs; by default all current speech')
parser.add_argument('--replace-existing', action='store_true', help='Explicitly replace existing baseline MP3s')
parser.add_argument('--plan', action='store_true', help='Print text counts without requesting synthesis')
args = parser.parse_args()
content = json.loads((ROOT / 'content/r3.json').read_text())
ids = args.only or list(content['speech'])
if any(i not in content['speech'] or not re.fullmatch(r'[A-Za-z0-9_-]+', i) for i in ids):
    parser.error('Unknown or unsafe clip ID')
print(json.dumps({'provider': 'azure-speech', 'clips': len(ids), 'characters': sum(len(content['speech'][i]['text']) for i in ids), 'replacesExisting': args.replace_existing}, ensure_ascii=False))
if args.plan:
    raise SystemExit(0)
region = os.environ.get('AZURE_SPEECH_REGION', '')
key = os.environ.get('AZURE_SPEECH_KEY', '')
if not key or not re.fullmatch(r'[a-z][a-z0-9-]{1,40}', region):
    raise SystemExit('Set AZURE_SPEECH_REGION and AZURE_SPEECH_KEY in the local process environment. Never paste keys into chat or source files.')
provenance_path = ROOT / 'content/audio-production.json'
provenance = json.loads(provenance_path.read_text()) if provenance_path.exists() else {'formatVersion': 1, 'clips': {}}
for clip_id in ids:
    line = content['speech'][clip_id]
    target = ROOT / 'public/media' / f'{clip_id}.mp3'
    if target.exists() and not args.replace_existing:
        raise SystemExit(f'{clip_id} exists; use --replace-existing only when a replacement is intended.')
    voice = 'zh-CN-XiaoxiaoNeural' if line['locale'] == 'zh-CN' else 'en-US-JennyNeural'
    ssml = f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{line["locale"]}"><voice name="{voice}"><prosody rate="-12%">{escape(line["text"])}</prosody></voice></speak>'
    request = urllib.request.Request(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode(), method='POST', headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'CarPlaygroundProduction/1'})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            audio = response.read()
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Azure Speech request failed (HTTP {error.code}); no credential or response body logged.') from None
    if not audio:
        raise SystemExit(f'Empty synthesis output for {clip_id}; existing file preserved.')
    with tempfile.NamedTemporaryFile(dir=target.parent, suffix='.mp3', delete=False) as temporary:
        temporary.write(audio)
        staged = Path(temporary.name)
    try:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(staged), '-f', 'null', '-'], check=True, capture_output=True)
        staged.replace(target)
    finally:
        staged.unlink(missing_ok=True)
    provenance['clips'][clip_id] = {'provider': 'azure-speech', 'voice': voice, 'rate': '-12%', 'text': line['text'], 'locale': line['locale'], 'textSha256': hashlib.sha256(line['text'].encode()).hexdigest(), 'audioSha256': hashlib.sha256(audio).hexdigest(), 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'listeningStatus': 'not-reviewed', 'distributionReview': 'requires-applicable-resource-terms', 'termsSource': 'https://www.microsoft.com/licensing/terms/en-US/productoffering/MicrosoftAzure/allprograms'}
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
    print(f'{clip_id}: generated, decoded, provenance saved; listening review pending')
print('Run node scripts/update-media-manifest.mjs and npm run audit:audio after synthesis. Do not mark distribution rights or listening passed automatically.')
