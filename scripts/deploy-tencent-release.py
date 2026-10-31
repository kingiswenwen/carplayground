"""Upload a verified static package; stage first, explicitly promote index last.

Cloud libraries are imported only for --execute. Credentials never enter site/.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime
import fcntl
import gzip
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def upload_payload(name, data, headers):
    options = {'ContentType': headers['Content-Type'], 'CacheControl': headers['Cache-Control']}
    payload = data
    if len(payload) > 512 * 1024 and name.endswith(('.js', '.json', '.css', '.html')):
        payload = gzip.compress(payload, compresslevel=6, mtime=0)
        options['ContentEncoding'] = 'gzip'
    if len(payload) > 512 * 1024:
        raise ValueError('Upload payload exceeds 512 KiB: ' + name)
    return payload, options


def validate_target(target):
    if (target.get('project') != 'CarPlayground'
            or not re.fullmatch(r'[a-z0-9][a-z0-9-]+-\d+', target.get('bucket', ''))
            or not re.fullmatch(r'[a-z]+-[a-z]+-?\d*', target.get('region', ''))
            or not re.fullmatch(r'(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}', target.get('domain', ''))
            or not target.get('httpsVerified')):
        raise ValueError('Target must be the verified, dedicated CarPlayground bucket and HTTPS domain')


def upload_blockers(manifest, authorized_review=False):
    if manifest.get('kind') not in ('review', 'family'):
        return ['Unknown release kind']
    outstanding = manifest.get('outstanding')
    if not isinstance(outstanding, list):
        return ['Missing release acceptance snapshot']
    forbidden = {'content-review'} if authorized_review else {'audio-distribution', 'content-review'}
    blocked = [item['id'] for item in outstanding
               if manifest['kind'] == 'family' or item['id'] in forbidden]
    if manifest.get('sourceDirty'):
        blocked.append('sourceDirty')
    for retained in manifest.get('retainedReleases', []):
        retained_issues = upload_blockers({**retained, 'retainedReleases': []}, authorized_review)
        blocked.extend('retained/' + retained.get('appReleaseId', 'unknown') + '/' + issue
                       for issue in retained_issues)
    return blocked


def read_local(package, file):
    data = (package / 'site' / file['path']).read_bytes()
    if len(data) != file['bytes'] or digest(data) != file['sha256']:
        raise ValueError('Package changed after verification: ' + file['path'])
    return data


def check_bytes(file, remote):
    if remote is None or digest(remote['data']) != file['sha256']:
        raise ValueError('Remote bytes differ: ' + file['path'])
    headers = {key.lower(): value for key, value in remote['headers'].items()}
    for header in ('Content-Type', 'Cache-Control'):
        actual, expected = headers.get(header.lower(), ''), file['headers'][header]
        if header == 'Cache-Control':
            # CDN may reorder directives while retaining the exact policy.
            actual = sorted(part.strip().lower() for part in actual.split(','))
            expected = sorted(part.strip().lower() for part in expected.split(','))
        if actual != expected:
            raise ValueError('Remote header differs: ' + file['path'] + ' ' + header)


def verify_phase(items, work, phase, progress, workers=8):
    """Bound object requests; a phase must finish before the next may start."""
    results = [None] * len(items)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        pending = {pool.submit(work, item): index for index, item in enumerate(items)}
        try:
            for done, future in enumerate(as_completed(pending), 1):
                results[pending[future]] = future.result()
                if progress:
                    progress(phase, done, len(items))
        except Exception:
            for future in pending:
                future.cancel()
            raise
    return results


def checkpoint_receipt(folder, receipt):
    temporary = folder / 'receipt.json.tmp'
    temporary.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(folder / 'receipt.json')


def deploy(package, manifest, cloud, receipt, save, publish=False, expected=None,
           authorized_review=False, before_promote=None, progress=None, workers=8):
    """cloud is a COS/CDN adapter. Tests inject transport failures and conflicts."""
    if not isinstance(workers, int) or not 1 <= workers <= 32:
        raise ValueError('Deployment workers must be between 1 and 32')
    blockers = upload_blockers(manifest, authorized_review)
    if blockers:
        raise ValueError('Upload blocked: ' + ', '.join(blockers))
    files = [file for file in manifest['files'] if file['path'] != 'index.html']
    index = next(file for file in manifest['files'] if file['path'] == 'index.html')
    previous = cloud.origin_get('index.html') if publish else None
    if publish:
        previous_hash = digest(previous['data']) if previous else 'absent'
        receipt['previousIndexSha256'] = previous_hash
        if expected != previous_hash:
            raise ValueError('Current index does not match --expect-current-sha256')
        if previous:
            save('previous-index.html', previous['data'])
    # Complete preflight before writing anything. Existing immutable objects must
    # match both bytes and headers; wrong metadata requires a new version ID.
    def preflight(file):
        upload_payload(file['path'], read_local(package, file), file['headers'])
        existing = cloud.origin_get(file['path'])
        if existing is None:
            return True
        check_bytes(file, existing)
        return False

    absent = verify_phase(files, preflight, 'preflight', progress, workers)
    missing = [file for file, is_absent in zip(files, absent) if is_absent]
    receipt['existingObjectsVerified'] = len(files) - len(missing)
    receipt_lock = threading.Lock()

    def upload(file):
        # Recheck immediately before write. Local flock serializes this tool;
        # COS versioning does not provide atomic immutable/entry CAS protection.
        existing = cloud.origin_get(file['path'])
        if existing is not None:
            check_bytes(file, existing)
            return
        cloud.put(file['path'], read_local(package, file), file['headers'])
        with receipt_lock:
            receipt['uploaded'].append(file['path'])
        check_bytes(file, cloud.origin_get(file['path']))

    verify_phase(missing, upload, 'upload-and-origin-readback', progress, workers)

    def cdn_verify(file):
        check_bytes(file, cloud.cdn_get(file['path']))
        with receipt_lock:
            receipt['cdnVerified'].append(file['path'])

    verify_phase(files, cdn_verify, 'cdn-readback', progress, workers)
    receipt['staged'] = True
    if not publish:
        return
    if before_promote:
        before_promote()
    current = cloud.origin_get('index.html')
    if (digest(current['data']) if current else 'absent') != expected:
        raise ValueError('Index changed during staging; promotion aborted')
    data = read_local(package, index)
    receipt['indexWriteAttempted'] = True
    cloud.put('index.html', data, index['headers'])
    receipt['indexWritten'] = True
    check_bytes(index, cloud.origin_get('index.html'))
    check_bytes(index, cloud.cdn_get('index.html'))
    receipt['published'] = True


class TencentCloud:
    def __init__(self, target, key):
        self.target = dict(target)
        self.key = dict(key)
        self.local = threading.local()
        self.bucket = target['bucket']
        self.base = 'https://' + target['domain'] + '/'

    @property
    def cos(self):
        from qcloud_cos import CosConfig, CosS3Client
        if not hasattr(self.local, 'cos'):
            self.local.cos = CosS3Client(CosConfig(Region=self.target['region'],
                                       SecretId=self.key['secretId'], SecretKey=self.key['secretKey'],
                                       Token=self.key.get('token'), Scheme='https', Timeout=120))
        return self.local.cos

    @property
    def http(self):
        import requests
        if not hasattr(self.local, 'http'):
            self.local.http = requests.Session()
        return self.local.http

    def origin_get(self, name):
        from qcloud_cos.cos_exception import CosServiceError
        try:
            response = self.cos.get_object(Bucket=self.bucket, Key=name)
        except CosServiceError as error:
            if error.get_status_code() == 404:
                return None
            raise
        stream = response['Body'].get_raw_stream()
        try:
            data = stream.read()
            encoding = response.get('Content-Encoding', response.get('ContentEncoding', ''))
            if encoding == 'gzip' and data.startswith(b'\x1f\x8b'):
                data = gzip.decompress(data)
            return {'data': data, 'headers': response}
        finally:
            stream.close()

    def put(self, name, data, headers):
        payload, options = upload_payload(name, data, headers)
        try:
            self.cos.put_object(Bucket=self.bucket, Key=name, Body=payload, EnableMD5=True, **options)
        except Exception as error:
            error.deployment_object = name
            error.deployment_bytes = len(payload)
            raise

    def cdn_get(self, name):
        # No credentials, cache-busting query, Host override or TLS bypass.
        response = self.http.get(self.base + name, timeout=(10, 40), allow_redirects=False)
        if response.status_code != 200:
            raise ValueError('CDN status ' + str(response.status_code) + ': ' + name)
        return {'data': response.content, 'headers': dict(response.headers)}


def private_credentials(filename):
    file = Path(filename).resolve()
    if file == ROOT or ROOT in file.parents or file.stat().st_mode & 0o077:
        raise ValueError('Credential file must be outside the repository and readable only by its owner')
    key = json.loads(file.read_text())
    if not all(isinstance(key.get(name), str) and key[name] for name in ('secretId', 'secretKey')):
        raise ValueError('Invalid credential file; values are never logged')
    return key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('--execute', action='store_true', help='Without this flag only a local plan is printed')
    parser.add_argument('--publish', action='store_true', help='Promote root index after all immutable objects pass CDN verification')
    parser.add_argument('--expect-current-sha256', help='Required with --publish: previous index hash, or absent for first publication')
    parser.add_argument('--credentials-file', help='Owner-only JSON file outside repository; secretId and secretKey')
    parser.add_argument('--authorized-review', action='store_true',
                        help='Use the explicit user authorization in deployment/automation.json; does not approve outstanding acceptance')
    parser.add_argument('--auto-current-index', action='store_true',
                        help='Read the current index under the deployment lock before staging')
    parser.add_argument('--workers', type=int, choices=range(1, 33), default=8,
                        help='Bound concurrent object requests (default 8; maximum 32)')
    args = parser.parse_args()
    package = args.package.resolve()
    verified = subprocess.run(['node', str(ROOT / 'scripts/verify-release.mjs'), str(package), '--json'],
                              check=True, capture_output=True, text=True)
    manifest = json.loads(verified.stdout)
    config_dir = Path(os.environ.get('CARPLAYGROUND_DEPLOYMENT_DIR', ROOT / 'deployment'))
    target = json.loads((config_dir / 'tencent-cloud.json').read_text())
    validate_target(target)
    if args.authorized_review:
        authorization = json.loads((config_dir / 'automation.json').read_text())
        if (authorization.get('authorizedBy') != 'user' or not authorization.get('authorizedAt')
                or authorization.get('repository') != os.environ.get('GITHUB_REPOSITORY', authorization.get('repository'))
                or authorization.get('domain') != target['domain']
                or authorization.get('reviewDeploymentAuthorized') is not True):
            raise ValueError('Missing explicit review deployment authorization')
    blockers = upload_blockers(manifest, args.authorized_review)
    plan = {'appReleaseId': manifest['appReleaseId'], 'contentReleaseId': manifest['contentReleaseId'],
            'objects': len(manifest['files']) - (0 if args.publish else 1),
            'bytes': sum(file['bytes'] for file in manifest['files'] if args.publish or file['path'] != 'index.html'), 'publishIndexLast': args.publish,
            'deleteOldObjects': False, 'blockers': blockers, 'executed': False,
            'authorizedReview': args.authorized_review, 'workers': args.workers,
            'outstanding': manifest['outstanding'], 'waived': manifest.get('waived', []),
            'sourceCommit': manifest['sourceCommit']}
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    if not args.execute:
        return
    if blockers:
        raise ValueError('Upload blocked: ' + ', '.join(blockers))
    if args.auto_current_index and args.expect_current_sha256:
        raise ValueError('Choose automatic or explicit current index, not both')
    if args.publish and not args.auto_current_index and not re.fullmatch(r'(?:absent|[a-f0-9]{64})', args.expect_current_sha256 or ''):
        raise ValueError('--publish requires --expect-current-sha256 HASH|absent')
    if not args.credentials_file:
        raise ValueError('--execute requires --credentials-file')
    logging.disable(logging.CRITICAL)
    key = private_credentials(args.credentials_file)
    artifacts = ROOT / '.release-artifacts'
    artifacts.mkdir(exist_ok=True)
    with (artifacts / 'tencent-deploy.lock').open('a') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
        folder = artifacts / ('deployment-' + stamp)
        folder.mkdir(mode=0o700)
        receipt = {**plan, 'startedAt': stamp, 'executed': True, 'uploaded': [], 'cdnVerified': [],
                   'staged': False, 'indexWritten': False, 'published': False}
        checkpoint_receipt(folder, receipt)
        try:
            cloud = TencentCloud(target, key)
            expected = args.expect_current_sha256
            if args.auto_current_index:
                current = cloud.origin_get('index.html')
                expected = digest(current['data']) if current else 'absent'
            def check_source():
                # Serialized Actions deployments also reject a superseded commit.
                if not os.environ.get('GITHUB_ACTIONS'):
                    return
                remote = subprocess.run(['git', 'ls-remote', 'origin', 'refs/heads/main'],
                                        check=True, capture_output=True, text=True).stdout.split()
                if not remote or remote[0] != manifest['sourceCommit']:
                    raise ValueError('A newer main commit exists; old run cannot promote')
            def progress(phase, done, total):
                if done % 25 == 0 or done == total:
                    receipt.update(phase=phase, phaseCompleted=done, phaseObjects=total)
                    checkpoint_receipt(folder, receipt)
                    print(f'Deployment {phase}: {done}/{total} objects verified', flush=True)
            deploy(package, manifest, cloud, receipt,
                   lambda name, data: (folder / name).write_bytes(data),
                   publish=args.publish, expected=expected, authorized_review=args.authorized_review,
                   before_promote=check_source, progress=progress, workers=args.workers)
        except Exception as error:
            # SDK exception strings can include request/response details.
            receipt['failureType'] = type(error).__name__
            if hasattr(error, 'deployment_object'):
                receipt['failureObject'] = error.deployment_object
                receipt['failurePayloadBytes'] = error.deployment_bytes
            cause, classes = error, []
            while cause is not None and len(classes) < 4:
                classes.append(type(cause).__name__)
                cause = cause.__cause__ or cause.__context__
            receipt['failureClasses'] = classes
            if isinstance(error, ValueError):
                receipt['reason'] = str(error)
            raise
        finally:
            checkpoint_receipt(folder, receipt)
            print('Deployment receipt: ' + str(folder / 'receipt.json'))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else 'Deployment failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
