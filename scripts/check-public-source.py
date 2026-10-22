"""Check the Git index before publishing; never print matched private values."""
from pathlib import PurePosixPath
import re
import subprocess
import sys

PRIVATE_PATHS = {'AGENTS.md', 'START_HERE.md'}
PATTERNS = {
    'private key or access token': rb'(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKID[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})',
    'personal filesystem path': rb'(?:/' + rb'home/[^/\s"\x27]+/|/' + rb'Users/[^/\s"\x27]+/)',
    'cloud resource identity': rb'(?:qcs::[a-z]|[a-z0-9-]+-\d{8,}\.cos\.[a-z0-9-]+\.myqcloud\.com)',
}


def problems(name, data):
    path = PurePosixPath(name)
    reasons = []
    if (name in PRIVATE_PATHS or name.startswith(('docs/development/', 'docs/planning/', '.private/'))
            or (name.startswith('deployment/') and name.endswith('.json') and not name.endswith('.example.json'))
            or (path.name.startswith('.env') and path.name != '.env.example')
            or path.suffix.lower() in {'.pem', '.key', '.p12', '.pfx', '.bundle'}
            or ('credentials' in path.name.lower() and path.suffix == '.json')):
        reasons.append('private file')
    if b'\0' not in data:
        reasons.extend(label for label, pattern in PATTERNS.items() if re.search(pattern, data))
    return reasons


def main():
    names = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    failures = []
    for name in filter(None, names):
        data = subprocess.check_output(['git', 'show', ':' + name])
        for reason in problems(name, data):
            failures.append(name + ': ' + reason)
    if failures:
        print('\n'.join(failures), file=sys.stderr)
        return 1
    print('Public source boundary check passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
