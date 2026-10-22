"""Keep private records and resource identifiers out of public source."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('boundary', Path(__file__).resolve().parents[1] / 'scripts/check-public-source.py')
boundary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boundary)


class PublicSourceTest(unittest.TestCase):
    def test_private_paths_are_rejected_even_with_empty_contents(self):
        for name in ['deployment/tencent-cloud.json', 'docs/development/receipt.json',
                     'docs/planning/private.md', 'START_HERE.md', 'AGENTS.md',
                     '.env.production', 'server.pem', 'credentials.json', '.private/config']:
            with self.subTest(path=name):
                self.assertIn('private file', boundary.problems(name, b''))

    def test_code_examples_and_public_asset_configuration_are_allowed(self):
        for name in ['src/app.tsx', '.env.example', 'deployment/cloud.example.json']:
            self.assertEqual(boundary.problems(name, b'https://example.invalid'), [])

    def test_identifiers_are_detected_without_returning_the_value(self):
        value = b'AKID' + b'x' * 24
        reasons = boundary.problems('README.md', value)
        self.assertEqual(reasons, ['private key or access token'])
        self.assertNotIn(value.decode(), str(reasons))
        self.assertIn('cloud resource identity', boundary.problems('config.txt', b'qcs:' + b':cos:region:uid/example'))


if __name__ == '__main__':
    unittest.main()
