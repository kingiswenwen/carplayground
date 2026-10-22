"""Exchange the production job's GitHub identity for short-lived COS credentials.

No long-lived cloud secret is uploaded to GitHub. Output is an owner-only file
outside the checkout; the workflow deletes it even when deployment fails.
"""
import base64
import json
import os
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]


def validate_claims(claims, config, environment):
    repository = environment.get('GITHUB_REPOSITORY')
    expected = {'iss': config['issuer'], 'aud': config['audience'],
                'sub': config['subject'], 'repository': repository,
                'repository_id': config['repositoryId'], 'repository_owner_id': config['repositoryOwnerId'],
                'ref': 'refs/heads/main', 'workflow_sha': environment.get('GITHUB_SHA'),
                'workflow_ref': repository + '/.github/workflows/deploy.yml@refs/heads/main' if repository else None}
    if (not repository or not expected['workflow_sha'] or any(claims.get(k) != v for k, v in expected.items())
            or claims.get('event_name') not in ('push', 'workflow_dispatch')
            or claims.get('exp', 0) <= time.time()):
        mismatches = [key for key, value in expected.items() if claims.get(key) != value]
        raise ValueError('Unexpected GitHub deployment identity (fields: ' + ', '.join(mismatches or ['event/expiry']) + ')')
    # Tencent STS independently verifies signature, issuer, audience and subject.


def request_json(url, headers=None, data=None):
    request = urllib.request.Request(url, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            code = json.load(error).get('Response', {}).get('Error', {}).get('Code', str(error.code))
        except Exception:
            code = str(error.code)
        raise ValueError('Identity endpoint rejected request: ' + code) from None


def main():
    config = json.loads((Path(os.environ.get('CARPLAYGROUND_DEPLOYMENT_DIR', ROOT / 'deployment')) / 'tencent-oidc.json').read_text())
    destination = Path(sys.argv[1]).resolve()
    if ROOT == destination or ROOT in destination.parents:
        raise ValueError('Credentials must be outside the checkout')
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    if urllib.parse.urlparse(url).scheme != 'https':
        raise ValueError('GitHub identity endpoint must use HTTPS')
    url += ('&' if '?' in url else '?') + urllib.parse.urlencode({'audience': config['audience']})
    token = request_json(url, {'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})['value']
    print('::add-mask::' + token, flush=True)
    claims = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
    validate_claims(claims, config, os.environ)
    body = {'RoleArn': config['roleArn'], 'ProviderId': config['providerId'],
            'WebIdentityToken': token, 'DurationSeconds': config['durationSeconds'],
            'RoleSessionName': 'github-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT']}
    result = request_json('https://sts.tencentcloudapi.com',
                          {'Content-Type': 'application/json', 'Authorization': 'SKIP',
                           'X-TC-Action': 'AssumeRoleWithWebIdentity',
                           'X-TC-Version': '2018-08-13', 'X-TC-Region': 'ap-beijing',
                           'X-TC-Timestamp': str(int(time.time()))},
                          json.dumps(body).encode())['Response']
    if result.get('Error'):
        raise ValueError('Tencent identity exchange failed: ' + result['Error']['Code'])
    key = result['Credentials']
    credentials = {'secretId': key['TmpSecretId'], 'secretKey': key['TmpSecretKey'], 'token': key['Token']}
    for value in credentials.values():
        print('::add-mask::' + value, flush=True)
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(credentials, output)
    print('Short-lived credentials ready (expires ' + result['Expiration'] + ')')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never dump network response bodies, SDK internals or identity tokens.
        print(str(error) if isinstance(error, ValueError) else 'Identity exchange failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
