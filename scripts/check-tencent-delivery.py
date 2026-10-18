"""Exercise the deployment engine on generic probes, never the application index.

Requires existing COS credentials. Writes only newly named releases/delivery-check-*
and one health/delivery-check-* entry. This is not an application acceptance test.
"""
import argparse
import datetime
import importlib.util
import json
import logging
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location('deployment', Path(__file__).with_name('deploy-tencent-release.py'))
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--credentials-file', required=True)
    parser.add_argument('--execute', action='store_true', required=True)
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    target = json.loads((deployment.ROOT / 'deployment/tencent-cloud.json').read_text())
    deployment.validate_target(target)
    key = deployment.private_credentials(args.credentials_file)
    actual = deployment.TencentCloud(target, key)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    check_id = 'delivery-check-' + stamp
    entry = 'health/' + check_id + '/index.html'

    class ProbeCloud:
        def key(self, name):
            mapped = entry if name == 'index.html' else name
            if mapped != entry and not mapped.startswith('releases/' + check_id + '-'):
                raise ValueError('Probe must not access application objects')
            return mapped

        def origin_get(self, name):
            return actual.origin_get(self.key(name))

        def put(self, name, data, headers):
            return actual.put(self.key(name), data, headers)

        def cdn_get(self, name):
            return actual.cdn_get(self.key(name))

    cloud = ProbeCloud()
    folder = deployment.ROOT / '.release-artifacts' / check_id
    folder.mkdir(mode=0o700)
    result = {'formatVersion': 1, 'checkedAt': stamp, 'applicationPublished': False,
              'scope': 'Generic probe only: deployment engine, COS/CDN headers and entry rollback',
              'domain': target['domain'], 'entry': entry, 'transitions': [], 'objects': []}
    with tempfile.TemporaryDirectory(prefix='carplayground-delivery-') as temporary:
        packages = []
        for version in ('a', 'b'):
            package = Path(temporary) / version
            resource = f'releases/{check_id}-{version}/assets/check.js'
            files = []
            for name, data, content_type in [
                (resource, f'/* CarPlayground generic delivery probe {version} */\n'.encode(), 'text/javascript; charset=utf-8'),
                ('index.html', f'<!doctype html><meta name="robots" content="noindex,nofollow"><title>Delivery check</title><script src="/{resource}"></script>'.encode(), 'text/html; charset=utf-8')]:
                local = package / 'site' / name
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_bytes(data)
                files.append({'path': name, 'bytes': len(data), 'sha256': deployment.digest(data),
                              'headers': {'Content-Type': content_type,
                                          'Cache-Control': 'no-cache' if name == 'index.html' else 'public, max-age=31536000, immutable'}})
            manifest = {'kind': 'review', 'sourceDirty': False, 'outstanding': [], 'files': files}
            packages.append((version, package, manifest))
            result['objects'].append(resource)
        expected = 'absent'
        for version, package, manifest in [packages[0], packages[1], packages[0]]:
            receipt = {'uploaded': [], 'cdnVerified': [], 'staged': False, 'indexWritten': False, 'published': False}
            try:
                deployment.deploy(package, manifest, cloud, receipt,
                                  lambda name, data: (folder / (str(len(result['transitions'])) + '-' + name)).write_bytes(data),
                                  publish=True, expected=expected)
            except Exception as error:
                result['failedTransition'] = {'activeProbe': version, 'receipt': receipt,
                                              'failureType': type(error).__name__}
                (folder / 'check.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
                print('Partial evidence: ' + str(folder / 'check.json'))
                raise
            expected = manifest['files'][-1]['sha256']
            result['transitions'].append({'activeProbe': version, 'entrySha256': expected, **receipt})
            (folder / 'check.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        result['oldAndNewResourcesRetained'] = all(cloud.origin_get(name) is not None for name in result['objects'])
        result['applicationIndexAbsent'] = actual.origin_get('index.html') is None
        result['resourceHeaders'] = []
        for name in result['objects']:
            response = cloud.cdn_get(name)
            headers = {key.lower(): value for key, value in response['headers'].items()}
            result['resourceHeaders'].append({'path': name, 'sha256': deployment.digest(response['data']),
                                              **{key: headers.get(key) for key in ('cache-control', 'content-type', 'age', 'x-cache-lookup')}})
        result['probeOnly'] = True
        (folder / 'check.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'evidence': str(folder / 'check.json'), **result}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error) if isinstance(error, ValueError) else 'Probe failed: ' + type(error).__name__) from None
