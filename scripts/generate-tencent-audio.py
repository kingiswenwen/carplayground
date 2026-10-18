"""Produce traceable Tencent TTS audio outside public/. Default: local plan only.

Does not activate services, accept terms, buy packages or change billing mode.
--max-cost-cny is a local batch estimate limit, not an account spending cap.
"""
import argparse
import base64
import datetime
from decimal import Decimal, ROUND_UP
import hashlib
import json
import logging
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid
from audio_candidate_processing import finalize, render_review, SOURCE_BYTES

ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require_generation_policy(config):
    if (config.get('spendingPolicy', {}).get('cloudTtsRouteEnabled') is not True
            or config.get('spendingPolicy', {}).get('paidSynthesisAllowed') is not True):
        raise ValueError('Cloud TTS is disabled by the user zero-spend policy; keep existing project audio')
    if config.get('distributionStatus') != 'cleared-for-intended-use':
        raise ValueError('Intended website distribution is not cleared: SLA 5.3 conflicts with commercial-use FAQ; no synthesis requested')


def make_plan(content, config, ids):
    if len(set(ids)) != len(ids) or not ids or any(key not in content['speech'] or not re.fullmatch(r'[A-Za-z0-9_-]+', key) for key in ids):
        raise ValueError('Unknown, duplicated or unsafe clip ID')
    lines = []
    for key in ids:
        line = content['speech'][key]
        voice = config['voices'].get(line['locale'])
        if voice is None:
            raise ValueError('Unsupported speech locale: ' + line['locale'])
        override = config.get('pronunciations', {}).get(key)
        if override and override['expectedText'] != line['text']:
            raise ValueError('Stale pronunciation override: ' + key)
        text = override['spokenText'] if override else line['text']
        limit = 150 if line['locale'] == 'zh-CN' else 500
        if not text.strip() or len(text) > limit:
            raise ValueError('Text exceeds short synthesis limit: ' + key)
        lines.append({'id': key, 'text': line['text'], 'synthesisText': text,
                      'locale': line['locale'], 'voiceId': voice['id'], 'voice': voice['name'],
                      'primaryLanguage': voice['primaryLanguage'], 'characters': len(text)})
    characters = sum(line['characters'] for line in lines)
    estimate = (Decimal(characters) * Decimal(config['estimatedPayAsYouGoCnyPer10000Characters']) / 10000).quantize(Decimal('.0001'), rounding=ROUND_UP)
    return {'provider': config['provider'], 'sourceContentReleaseId': content['id'],
            'clips': len(lines), 'characters': characters, 'estimatedMaximumBatchCnyBeforeQuota': str(estimate),
            'priceCheckedAt': config['priceCheckedAt'], 'freeQuotaAssumed': False,
            'spendingPolicy': config.get('spendingPolicy'),
            'distributionStatus': config.get('distributionStatus'),
            'applicationMediaReplaced': False, 'voices': config['voices'], 'lines': lines}


def create_client(filename):
    file = Path(filename).resolve()
    if ROOT in file.parents or file.stat().st_mode & 0o077:
        raise ValueError('Use an owner-only credential file outside the repository')
    key = json.loads(file.read_text())
    from tencentcloud.common.credential import Credential
    from tencentcloud.tts.v20190823.tts_client import TtsClient
    return TtsClient(Credential(key['secretId'], key['secretKey']), 'ap-beijing')


def synthesize(client, plan, config, content, output):
    status = client.call_json('DescribeOpenStatus', {'InterfaceName': config['serviceInterface']})['Response']
    if status.get('HasOpen') is not True or status.get('HasArrearage') is not False:
        raise ValueError('Selected TTS service is not open or not in good standing; no synthesis requested')
    # Validate every baseline before any synthesis request.
    baselines = {}
    for line in plan['lines']:
        asset = next(asset for asset in content['assets'] if asset['id'] == line['id'] and asset['kind'] == 'audio')
        file = ROOT / 'public' / asset['path']
        if sha(file.read_bytes()) != asset['sha256']:
            raise ValueError('Baseline differs from content: ' + line['id'])
        baselines[line['id']] = file
    output.mkdir(parents=True, exist_ok=False)
    for name in ('raw', 'baseline', 'source'):
        (output / name).mkdir()
    (output / 'source/generate-tencent-audio.py').write_bytes(Path(__file__).read_bytes())
    (output / 'source/audio_candidate_processing.py').write_bytes(SOURCE_BYTES)
    (output / 'source/tencent-tts-production.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    report = {**plan, 'clips': [], 'requests': [], 'plannedClips': plan['clips'], 'status': 'in-progress',
              'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'generatorSha256': sha(Path(__file__).read_bytes()), 'configCanonicalSha256': sha(json.dumps(config, sort_keys=True, ensure_ascii=False).encode()),
              'serviceRequestId': status.get('RequestId'), 'distributionApproved': False,
              'humanListeningCompleted': False, 'audioUploaded': False, 'productionConfig': config}

    def save():
        (output / 'generation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    save()
    for line in plan['lines']:
        clip_id = line['id']
        shutil.copyfile(baselines[clip_id], output / 'baseline' / (clip_id + '.mp3'))
        params = {'Text': line['synthesisText'], 'SessionId': str(uuid.uuid4()),
                  'VoiceType': line['voiceId'], 'PrimaryLanguage': line['primaryLanguage'],
                  'Speed': config['speed'], 'Volume': config['volume'],
                  'SampleRate': config['sampleRate'], 'Codec': config['codec'], 'ModelType': 1}
        # No automatic synthesis retries: a timeout may still have been billed.
        report['requests'].append({'id': clip_id, 'sessionId': params['SessionId'],
                                   'characters': line['characters'], 'state': 'requested'})
        save()
        try:
            response = client.call_json('TextToVoice', params)['Response']
            report['requests'][-1].update(state='response-received', requestId=response.get('RequestId'))
            save()
            audio = base64.b64decode(response['Audio'], validate=True)
            raw = output / 'raw' / (clip_id + '.wav')
            raw.write_bytes(audio)
            processing, duration = finalize(raw, output / (clip_id + '.mp3'))
        except Exception as error:
            report.update(status='failed', failedClip=clip_id, failureType=type(error).__name__)
            save()
            raise
        record = {**line, 'provider': config['provider'], 'requestId': response.get('RequestId'),
                  'textSha256': sha(line['text'].encode()), 'synthesisTextSha256': sha(line['synthesisText'].encode()),
                  'rawSha256': sha(audio), 'sha256': sha((output / (clip_id + '.mp3')).read_bytes()),
                  'baselineSha256': sha(baselines[clip_id].read_bytes()), 'path': clip_id + '.mp3',
                  'durationSeconds': duration, 'processing': processing, 'listeningStatus': 'not-reviewed',
                  'distributionReview': 'requires-applicable-resource-terms'}
        report['clips'].append(record)
        save()
        print(clip_id + ': synthesized, decoded, endpoint-processed; listening pending', flush=True)
    report['status'] = 'audio-generated'
    save()
    render_review(report, output)
    report['status'] = 'generated-pending-audit'
    save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--credentials-file')
    parser.add_argument('--max-cost-cny', default='0', help='Explicitly authorized batch estimate limit; default zero')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    config = json.loads((ROOT / 'content/tencent-tts-production.json').read_text())
    config['spendingPolicy'] = json.loads((ROOT / 'content/audio-spending-policy.json').read_text())
    content = json.loads((ROOT / 'content/r3.json').read_text())
    plan = make_plan(content, config, args.only or list(content['speech']))
    print(json.dumps({key: value for key, value in plan.items() if key != 'lines'}, ensure_ascii=False, indent=2), flush=True)
    if not args.execute:
        return
    budget = Decimal(args.max_cost_cny)
    if not budget.is_finite() or budget < Decimal(plan['estimatedMaximumBatchCnyBeforeQuota']):
        raise ValueError('Batch exceeds authorized cost estimate; no synthesis requested. Free quota has not been assumed.')
    if not args.credentials_file:
        raise ValueError('--execute requires an owner-only credential file')
    output = (args.output or ROOT / '.release-artifacts/tts-candidates' / ('tencent-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))).resolve()
    if output == ROOT or (ROOT in output.parents and (ROOT / '.release-artifacts') not in output.parents):
        raise ValueError('Repository output must be under .release-artifacts, never public/')
    if output.exists():
        raise ValueError('Refusing to overwrite an existing generation')
    for binary in ('ffmpeg', 'ffprobe'):
        if not shutil.which(binary):
            raise ValueError('Missing audio processor: ' + binary)
    require_generation_policy(config)
    logging.disable(logging.CRITICAL)
    synthesize(create_client(args.credentials_file), plan, config, content, output)
    print(str(output))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else 'Generation failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
