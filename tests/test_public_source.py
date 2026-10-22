"""Keep private records and resource identifiers out of public source."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('boundary', Path(__file__).resolve().parents[1] / 'scripts/check-public-source.py')
boundary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boundary)


class PublicSourceTest(unittest.TestCase):
    def test_private_file_removed_from_tip_is_still_rejected_in_history(self):
        with tempfile.TemporaryDirectory() as folder:
            def git(*args):
                return subprocess.check_output(['git', '-c', 'user.name=Example', '-c',
                                                'user.email=example@example.invalid', *args], cwd=folder)
            git('init', '-q')
            file = Path(folder) / '.env'
            file.write_text('PRIVATE_SETTING=example')
            git('add', '.env'); git('commit', '-qm', 'Add private fixture')
            file.unlink()
            (Path(folder) / 'README.md').write_text('Public example')
            git('add', '-A'); git('commit', '-qm', 'Remove fixture from current files')
            reasons = boundary.history_problems('HEAD', folder)
            self.assertIn('.env: private file', reasons)
            self.assertNotIn('PRIVATE_SETTING', str(reasons))

    def test_literal_credential_assignments_are_rejected_without_values(self):
        value = b'secret_key = "' + b'x' * 24 + b'"'
        self.assertIn('literal credential assignment', boundary.problems('config.py', value))

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
