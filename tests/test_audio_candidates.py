"""Exercise real FFmpeg outputs: endpoint trimming must preserve internal pauses."""
from array import array
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from audio_candidate_processing import finalize, word_boundary

class CandidateProcessingTests(unittest.TestCase):
    def test_nested_artifact_directory_in_public_is_rejected_by_both_tools(self):
        root = Path(__file__).resolve().parents[1]
        output = root / 'public/.release-artifacts/must-not-write'
        commands = [
            ['generate-offline-audio-candidates.py', '--only', 'wheel', '--model-variant', 'english', '--en-voices', 'af_heart', '--output', str(output)],
            ['audio_candidate_processing.py', '/missing-generation', str(output)],
        ]
        for script, *arguments in commands:
            with self.subTest(script=script):
                result = subprocess.run([sys.executable, str(root / 'scripts' / script), *arguments], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('.release-artifacts', result.stderr)
                self.assertFalse(output.exists())

    def write_wave(self, path, segments):
        rate = 24000
        samples = []
        for seconds, amplitude in segments:
            samples.extend(int(32767 * amplitude * math.sin(2 * math.pi * 440 * index / rate)) for index in range(round(seconds * rate)))
        with wave.open(str(path), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(rate)
            output.writeframes(struct.pack('<' + 'h' * len(samples), *samples))

    def test_trim_preserves_two_tones_and_the_full_internal_pause(self):
        with tempfile.TemporaryDirectory() as temp:
            raw, target = Path(temp) / 'source.wav', Path(temp) / 'output.mp3'
            self.write_wave(raw, [(.35, 0), (.25, .4), (.4, 0), (.25, .4), (.8, 0)])
            processing, duration = finalize(raw, target)
            self.assertAlmostEqual(processing['trimStartSeconds'], .23, delta=.02)
            self.assertAlmostEqual(duration, 1.3, delta=.08)
            decoded = array('f', subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(target), '-ar', '24000', '-ac', '1', '-f', 'f32le', 'pipe:1']))
            def rms(begin, end):
                values = decoded[int(begin * 24000):int(end * 24000)]
                return math.sqrt(sum(value * value for value in values) / len(values))
            self.assertGreater(rms(.18, .24), .02)
            self.assertLess(rms(.5, .6), .001)
            self.assertGreater(rms(.82, .88), .02)

    def test_silent_input_is_rejected_before_publishing_a_file(self):
        with tempfile.TemporaryDirectory() as temp:
            raw, target = Path(temp) / 'silence.wav', Path(temp) / 'output.mp3'
            self.write_wave(raw, [(1, 0)])
            with self.assertRaisesRegex(RuntimeError, 'No measurable speech'):
                finalize(raw, target)
            self.assertFalse(target.exists())

    def test_context_word_boundary_stays_in_the_quiet_separator(self):
        rate = 24000
        samples = [.1] * (rate // 2) + [0] * (rate // 4) + [.1] * (rate // 2)
        cut, evidence = word_boundary(samples, rate, .75)
        self.assertAlmostEqual(cut / rate, .63, delta=.02)
        self.assertTrue(all(value == 0 for value in samples[cut:int(.75 * rate)]))
        self.assertAlmostEqual(evidence['quietGapSeconds'][1], .75, delta=.02)

    def test_context_without_a_safe_gap_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'No safe quiet boundary'):
            word_boundary([.1] * 24000, 24000, .5)

if __name__ == '__main__':
    unittest.main()
