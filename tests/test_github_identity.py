"""Deployment identity isolation: reject PR, other repo/branch/job and stale JWTs."""
import copy
import importlib.util
import json
from pathlib import Path
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('identity', ROOT / 'scripts/github-oidc-credentials.py')
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


class IdentityTest(unittest.TestCase):
    def test_only_current_main_production_job_is_accepted(self):
        config = json.loads((ROOT / 'deployment/tencent-oidc.json').read_text())
        claims = {'iss': config['issuer'], 'aud': config['audience'], 'sub': config['subject'],
                  'repository': 'kingiswenwen/carplayground', 'ref': 'refs/heads/main',
                  'event_name': 'push', 'sha': 'a' * 40, 'exp': time.time() + 60}
        identity.validate_claims(claims, config, {'GITHUB_SHA': 'a' * 40})
        for name, value in [('iss', 'https://untrusted.example'), ('aud', 'other'),
                            ('sub', 'repo:kingiswenwen/carplayground:pull_request'),
                            ('repository', 'someone/fork'), ('ref', 'refs/heads/other'),
                            ('event_name', 'pull_request'), ('sha', 'b' * 40), ('exp', 0)]:
            with self.subTest(claim=name):
                wrong = copy.deepcopy(claims); wrong[name] = value
                with self.assertRaises(ValueError):
                    identity.validate_claims(wrong, config, {'GITHUB_SHA': 'a' * 40})


if __name__ == '__main__':
    unittest.main()
