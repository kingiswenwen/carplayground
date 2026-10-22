"""Release transport failure checks, without cloud access or credentials."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('deployment', Path(__file__).resolve().parents[1] / 'scripts/deploy-tencent-release.py')
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class Cloud:
    def __init__(self):
        self.objects = {}
        self.events = []
        self.fail_cdn = None

    def origin_get(self, name):
        self.events.append(('origin', name))
        return copy.deepcopy(self.objects.get(name))

    def put(self, name, data, headers):
        self.events.append(('put', name))
        self.objects[name] = {'data': data, 'headers': dict(headers)}

    def cdn_get(self, name):
        self.events.append(('cdn', name))
        if name == self.fail_cdn:
            raise ValueError('CDN returns unavailable object')
        return copy.deepcopy(self.objects.get(name))


class DeploymentTest(unittest.TestCase):
    def test_private_configuration_must_describe_a_verified_project_target(self):
        target = {'project': 'CarPlayground', 'bucket': 'example-project-1000000000',
                  'region': 'ap-beijing', 'domain': 'example.invalid', 'httpsVerified': True}
        deployment.validate_target(target)
        for field, invalid in [('project', 'another-project'), ('bucket', ''),
                               ('region', ''), ('domain', 'https://example.invalid/path'),
                               ('httpsVerified', False)]:
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    deployment.validate_target({**target, field: invalid})

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name)
        self.cloud = Cloud()
        self.files = []
        for name, data in [('releases/new/assets/app.js', b'new app'), ('media/new/sound.mp3', b'public sound'), ('index.html', b'new index')]:
            target = self.package / 'site' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            self.files.append({'path': name, 'bytes': len(data), 'sha256': deployment.digest(data),
                               'headers': {'Content-Type': 'text/html' if name == 'index.html' else 'application/octet-stream',
                                           'Cache-Control': 'no-cache' if name == 'index.html' else 'public, max-age=31536000, immutable'}})
        self.manifest = {'kind': 'review', 'sourceDirty': False, 'outstanding': [{'id': 'real-ipad'}], 'files': self.files}
        self.receipt = {'uploaded': [], 'cdnVerified': [], 'indexWritten': False, 'published': False}
        self.saved = {}

    def run_deploy(self, **kwargs):
        deployment.deploy(self.package, self.manifest, self.cloud, self.receipt, self.saved.__setitem__, **kwargs)

    def test_unlicensed_and_family_incomplete_packages_write_nothing(self):
        for kind, outstanding in [('review', [{'id': 'audio-distribution'}]), ('family', [{'id': 'real-ipad'}])]:
            self.manifest.update(kind=kind, outstanding=outstanding)
            with self.assertRaisesRegex(ValueError, 'Upload blocked'):
                self.run_deploy()
            self.assertEqual(self.cloud.events, [])

    def test_existing_version_conflict_rejects_before_any_upload(self):
        name = self.files[1]['path']
        self.cloud.objects[name] = {'data': b'different recording', 'headers': self.files[1]['headers']}
        with self.assertRaisesRegex(ValueError, 'Remote bytes differ'):
            self.run_deploy()
        self.assertFalse(any(event == 'put' for event, _ in self.cloud.events))

    def test_explicit_review_deployment_keeps_outstanding_but_family_still_blocks(self):
        pending = [{'id': 'audio-distribution'}, {'id': 'audio-listening'}]
        self.manifest['outstanding'] = pending
        self.run_deploy(publish=True, expected='absent', authorized_review=True)
        self.assertTrue(self.receipt['published'])
        self.assertEqual(self.manifest['outstanding'], pending)
        self.manifest['kind'] = 'family'
        self.assertEqual(deployment.upload_blockers(self.manifest, True), ['audio-distribution', 'audio-listening'])
        self.manifest.update(kind='review', outstanding=[{'id': 'content-review'}], sourceDirty=True)
        self.assertEqual(deployment.upload_blockers(self.manifest, True), ['content-review', 'sourceDirty'])

    def test_superseded_run_cannot_promote_even_after_staging(self):
        def reject():
            raise ValueError('superseded main')
        with self.assertRaisesRegex(ValueError, 'superseded main'):
            self.run_deploy(publish=True, expected='absent', before_promote=reject)
        self.assertNotIn('index.html', self.cloud.objects)
        self.assertTrue(self.receipt['staged'])

    def test_retained_unlicensed_or_unreviewed_version_also_blocks_upload(self):
        for previous in [{'appReleaseId': 'old', 'kind': 'review', 'sourceDirty': False,
                          'outstanding': [{'id': 'audio-distribution'}]},
                         {'appReleaseId': 'old'}]:
            self.manifest['retainedReleases'] = [previous]
            with self.assertRaisesRegex(ValueError, 'Upload blocked: retained/old/'):
                self.run_deploy()
            self.assertEqual(self.cloud.events, [])

    def test_cdn_cache_directive_reordering_preserves_policy_but_shorter_ttl_fails(self):
        file = self.files[0]
        remote = {'data': (self.package / 'site' / file['path']).read_bytes(),
                  'headers': {'content-type': file['headers']['Content-Type'],
                              'cache-control': 'public, immutable, max-age=31536000'}}
        deployment.check_bytes(file, remote)
        remote['headers']['cache-control'] = 'public, immutable, max-age=60'
        with self.assertRaisesRegex(ValueError, 'Cache-Control'):
            deployment.check_bytes(file, remote)

    def test_cdn_failure_preserves_previous_index_and_retained_version(self):
        self.cloud.objects['index.html'] = {'data': b'old index', 'headers': self.files[-1]['headers']}
        self.cloud.objects['releases/old/assets/app.js'] = {'data': b'old app', 'headers': {}}
        self.cloud.fail_cdn = self.files[1]['path']
        with self.assertRaisesRegex(ValueError, 'CDN returns'):
            self.run_deploy(publish=True, expected=deployment.digest(b'old index'))
        self.assertEqual(self.cloud.objects['index.html']['data'], b'old index')
        self.assertEqual(self.cloud.objects['releases/old/assets/app.js']['data'], b'old app')
        self.assertEqual(self.saved['previous-index.html'], b'old index')
        self.assertNotIn(('put', 'index.html'), self.cloud.events)

    def test_stage_resume_then_promote_and_rollback_keep_resources(self):
        self.run_deploy()
        self.assertNotIn('index.html', self.cloud.objects)
        uploaded_before = len([event for event in self.cloud.events if event[0] == 'put'])
        self.run_deploy(publish=True, expected='absent')
        self.assertTrue(self.receipt['published'])
        self.assertEqual(len([event for event in self.cloud.events if event[0] == 'put']), uploaded_before + 1)
        self.assertEqual([event for event in self.cloud.events if event[0] == 'put'][-1], ('put', 'index.html'))
        # Promote a previously verified index to roll back; newer assets stay.
        previous = b'previous entry'
        (self.package / 'site/index.html').write_bytes(previous)
        self.files[-1].update(bytes=len(previous), sha256=deployment.digest(previous))
        self.run_deploy(publish=True, expected=deployment.digest(b'new index'))
        self.assertEqual(self.cloud.objects['index.html']['data'], previous)
        self.assertIn('releases/new/assets/app.js', self.cloud.objects)

    def test_wrong_expected_index_or_changed_local_package_prevents_upload(self):
        with self.assertRaisesRegex(ValueError, 'Current index'):
            self.run_deploy(publish=True, expected='0' * 64)
        (self.package / 'site' / self.files[0]['path']).write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'Package changed'):
            self.run_deploy()
        self.assertFalse(any(event == 'put' for event, _ in self.cloud.events))

    def test_other_publisher_changes_index_during_staging_promotion_stops(self):
        original_get = self.cloud.cdn_get

        def concurrent_write(name):
            result = original_get(name)
            self.cloud.objects['index.html'] = {'data': b'another publisher', 'headers': {}}
            return result

        self.cloud.cdn_get = concurrent_write
        with self.assertRaisesRegex(ValueError, 'Index changed during staging'):
            self.run_deploy(publish=True, expected='absent')
        self.assertEqual(self.cloud.objects['index.html']['data'], b'another publisher')
        self.assertNotIn(('put', 'index.html'), self.cloud.events)

    def test_entry_cdn_failure_records_write_without_claiming_verified_publish(self):
        self.cloud.fail_cdn = 'index.html'
        with self.assertRaisesRegex(ValueError, 'CDN returns'):
            self.run_deploy(publish=True, expected='absent')
        self.assertEqual(self.cloud.objects['index.html']['data'], b'new index')
        self.assertTrue(self.receipt['indexWritten'])
        self.assertFalse(self.receipt['published'])


if __name__ == '__main__':
    unittest.main()
