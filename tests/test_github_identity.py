"""Deployment identity checks use synthetic configuration, without cloud access."""
import copy
import importlib.util
from pathlib import Path
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('identity', ROOT / 'scripts/github-oidc-credentials.py')
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


class IdentityTest(unittest.TestCase):
    def test_only_current_main_production_job_is_accepted(self):
        config = {'issuer': 'https://token.actions.githubusercontent.com',
                  'audience': 'example-audience', 'subject': 'example-production-subject',
                  'repositoryId': '1000000000', 'repositoryOwnerId': '1000000001'}
        environment = {'GITHUB_SHA': 'a' * 40, 'GITHUB_REPOSITORY': 'example/carplayground'}
        claims = {'iss': config['issuer'], 'aud': config['audience'], 'sub': config['subject'],
                  'repository': environment['GITHUB_REPOSITORY'], 'ref': 'refs/heads/main',
                  'repository_id': config['repositoryId'], 'repository_owner_id': config['repositoryOwnerId'],
                  'workflow_ref': 'example/carplayground/.github/workflows/deploy.yml@refs/heads/main',
                  'event_name': 'push', 'workflow_sha': environment['GITHUB_SHA'], 'exp': time.time() + 60}
        identity.validate_claims(claims, config, environment)
        for name, value in [('iss', 'https://untrusted.example'), ('aud', 'other'),
                            ('sub', 'other'), ('repository', 'someone/fork'), ('ref', 'refs/heads/other'),
                            ('repository_id', 'other'), ('repository_owner_id', 'other'),
                            ('workflow_ref', 'example/carplayground/.github/workflows/other.yml@refs/heads/main'),
                            ('event_name', 'pull_request'), ('workflow_sha', 'b' * 40), ('exp', 0)]:
            with self.subTest(claim=name):
                wrong = copy.deepcopy(claims); wrong[name] = value
                with self.assertRaises(ValueError):
                    identity.validate_claims(wrong, config, environment)
        for missing in ('GITHUB_SHA', 'GITHUB_REPOSITORY'):
            with self.subTest(missing=missing):
                wrong = copy.deepcopy(environment); del wrong[missing]
                with self.assertRaises(ValueError):
                    identity.validate_claims(claims, config, wrong)


if __name__ == '__main__':
    unittest.main()
