"""Exercise synthesis preparation and real ffmpeg processing with a fake API."""
import base64
import binascii
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('tts_production', ROOT / 'scripts/generate-tencent-audio.py')
tts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tts)


class TTS:
    def __init__(self, opened=True, audio=None):
        self.opened, self.audio, self.calls = opened, audio, []

    def call_json(self, action, params):
        self.calls.append((action, params))
        if action == 'DescribeOpenStatus':
            return {'Response': {'HasOpen': self.opened, 'HasArrearage': False, 'RequestId': 'service-check'}}
        return {'Response': {'Audio': self.audio, 'RequestId': 'synthesis-check'}}


class AudioProductionTest(unittest.TestCase):
    def setUp(self):
        self.content = json.loads((ROOT / 'content/r3.json').read_text())
        self.config = json.loads((ROOT / 'content/tencent-tts-production.json').read_text())
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name) / 'generation'

    def test_full_plan_has_all_speech_and_explicit_unassumed_quota(self):
        plan = tts.make_plan(self.content, self.config, list(self.content['speech']))
        self.assertEqual(plan['clips'], 162)
        self.assertGreaterEqual(plan['characters'], 2340)
        self.assertFalse(plan['freeQuotaAssumed'])
        self.assertFalse(plan['applicationMediaReplaced'])
        car = next(line for line in plan['lines'] if line['id'] == 'name-CAR03')
        self.assertEqual(car['text'], '保时捷 911 GT3 RS')
        self.assertIn('九一一', car['synthesisText'])
        self.assertEqual(next(line for line in plan['lines'] if line['id'] == 'wheel')['voiceId'], 403006)

    def test_stale_pronunciation_duplicate_ids_and_oversized_text_reject(self):
        config = copy.deepcopy(self.config)
        config['pronunciations']['name-CAR03']['expectedText'] = 'old text'
        with self.assertRaisesRegex(ValueError, 'Stale pronunciation'):
            tts.make_plan(self.content, config, ['name-CAR03'])
        with self.assertRaisesRegex(ValueError, 'duplicated'):
            tts.make_plan(self.content, self.config, ['wheel', 'wheel'])
        content = copy.deepcopy(self.content)
        content['speech']['wheel']['text'] = 'a' * 501
        with self.assertRaisesRegex(ValueError, 'short synthesis limit'):
            tts.make_plan(content, self.config, ['wheel'])

    def test_closed_service_or_bad_baseline_prevents_synthesis(self):
        plan = tts.make_plan(self.content, self.config, ['wheel'])
        client = TTS(opened=False)
        with self.assertRaisesRegex(ValueError, 'not open'):
            tts.synthesize(client, plan, self.config, self.content, self.output)
        self.assertEqual([action for action, _ in client.calls], ['DescribeOpenStatus'])
        self.assertFalse(self.output.exists())
        content = copy.deepcopy(self.content)
        next(asset for asset in content['assets'] if asset['id'] == 'wheel')['sha256'] = '0' * 64
        client = TTS()
        with self.assertRaisesRegex(ValueError, 'Baseline differs'):
            tts.synthesize(client, plan, self.config, content, self.output)
        self.assertEqual([action for action, _ in client.calls], ['DescribeOpenStatus'])

    def test_no_authorized_budget_exits_before_credentials_or_cloud_access(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/generate-tencent-audio.py'),
                                 '--execute', '--credentials-file', '/file-that-does-not-exist'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('exceeds authorized cost estimate', result.stderr)

    def test_nested_public_artifact_directory_cannot_bypass_staging_boundary(self):
        target = ROOT / 'public/.release-artifacts/must-not-write'
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/generate-tencent-audio.py'),
                                 '--execute', '--max-cost-cny', '2', '--credentials-file', '/does-not-exist',
                                 '--output', str(target)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('never public/', result.stderr)
        self.assertFalse(target.exists())

    def test_real_waveform_processing_is_staged_and_provenance_retained(self):
        waveform = subprocess.check_output(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                                           'sine=frequency=440:duration=0.6', '-ar', '24000', '-ac', '1', '-f', 'wav', '-'])
        client = TTS(audio=base64.b64encode(waveform).decode())
        plan = tts.make_plan(self.content, self.config, ['wheel'])
        original = (ROOT / 'public/media/wheel.mp3').read_bytes()
        tts.synthesize(client, plan, self.config, self.content, self.output)
        self.assertEqual((ROOT / 'public/media/wheel.mp3').read_bytes(), original)
        report = json.loads((self.output / 'generation.json').read_text())
        self.assertEqual(report['status'], 'generated-pending-audit')
        self.assertFalse(report['distributionApproved'])
        self.assertFalse(report['humanListeningCompleted'])
        self.assertEqual(report['clips'][0]['requestId'], 'synthesis-check')
        self.assertEqual(report['clips'][0]['rawSha256'], tts.sha(waveform))
        self.assertTrue((self.output / 'index.html').exists())
        self.assertEqual([action for action, _ in client.calls], ['DescribeOpenStatus', 'TextToVoice'])

    def test_invalid_api_audio_keeps_request_receipt_and_never_retries(self):
        client = TTS(audio='%%%invalid-base64%%%')
        plan = tts.make_plan(self.content, self.config, ['wheel'])
        with self.assertRaises(binascii.Error):
            tts.synthesize(client, plan, self.config, self.content, self.output)
        report = json.loads((self.output / 'generation.json').read_text())
        self.assertEqual(report['requests'][0]['requestId'], 'synthesis-check')
        self.assertEqual(len(report['requests']), 1)
        self.assertEqual(report['clips'], [])
        self.assertEqual(report['status'], 'failed')
        self.assertEqual([action for action, _ in client.calls].count('TextToVoice'), 1)


if __name__ == '__main__':
    unittest.main()
