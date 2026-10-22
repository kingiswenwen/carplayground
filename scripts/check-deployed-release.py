"""Verify the public HTTPS entry, media Range and missing-file behavior."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request


def check(package):
    manifest = json.loads((package / 'manifest.json').read_text())
    target = json.loads((Path(__file__).resolve().parents[1] / 'deployment/tencent-cloud.json').read_text())
    base = 'https://' + target['domain'] + '/'
    index = next(f for f in manifest['files'] if f['path'] == 'index.html')
    with urllib.request.urlopen(base, timeout=40) as response:
        data = response.read()
        if (response.status != 200 or response.url != base + 'index.html'
                or hashlib.sha256(data).hexdigest() != index['sha256']
                or 'no-cache' not in response.headers.get('Cache-Control', '')
                or ('/releases/' + manifest['appReleaseId'] + '/') not in data.decode()):
            raise ValueError('Public entry does not match the deployed release')
    sound = next(f for f in manifest['files'] if f['path'].endswith('.mp3'))
    request = urllib.request.Request(base + sound['path'], headers={'Range': 'bytes=0-15'})
    with urllib.request.urlopen(request, timeout=40) as response:
        if (response.status != 206 or response.headers.get('Content-Range') != 'bytes 0-15/' + str(sound['bytes'])
                or response.headers.get_content_type() != 'audio/mpeg'
                or response.read() != (package / 'site' / sound['path']).read_bytes()[:16]):
            raise ValueError('Public audio Range request does not match')
    try:
        urllib.request.urlopen(base + 'missing-' + manifest['appReleaseId'], timeout=40)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise ValueError('Missing object does not return 404') from None
    else:
        raise ValueError('Missing object unexpectedly returns success')
    return {'appReleaseId': manifest['appReleaseId'], 'sourceCommit': manifest['sourceCommit'],
            'url': base, 'entryVerified': True, 'audioRangeVerified': True, 'missingFile404': True}


if __name__ == '__main__':
    try:
        result = check(Path(sys.argv[1]).resolve())
        folder = Path('.release-artifacts'); folder.mkdir(exist_ok=True)
        (folder / 'public-delivery-check.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else 'Public delivery check failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
