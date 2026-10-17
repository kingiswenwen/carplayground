"""Build an isolated Playwright WPE WebKit library environment on Arch/Omarchy.

Downloads known distro packages, verifies published package checksums, extracts
libraries to the user's cache, and creates a wrapper. No sudo or system config.
"""
import concurrent.futures
import hashlib
import json
import lzma
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import tempfile
import urllib.request

if platform.system() != 'Linux' or platform.machine() != 'x86_64':
    raise SystemExit('This compatibility helper targets Linux x86_64 only.')
ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / '.cache/carplayground-webkit-compat'
LIBS = CACHE / 'lib'
LIBS.mkdir(parents=True, exist_ok=True)
PLUGINS = CACHE / 'gstreamer-plugins'
PLUGINS.mkdir(parents=True, exist_ok=True)
needed = {'libicu74', 'libxml2', 'libflite1', 'libavif16', 'libharfbuzz-icu0', 'libmanette-0.2-0', 'libhyphen0', 'libdav1d7', 'libgav1-1', 'libsvtav1enc1d1', 'librav1e0', 'libyuv0', 'libabsl20220623t64', 'gstreamer1.0-plugins-good'}
def download(url, destination):
    if not destination.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
        temporary = destination.with_suffix(destination.suffix + '.part')
        temporary.write_bytes(data)
        temporary.replace(destination)
    return destination.read_bytes()
index = CACHE / 'packages.json'
packages = json.loads(index.read_text()) if index.exists() else {}
if not needed.issubset(packages):
    packages = {}
    for component in ['main', 'universe']:
        archive = download(f'https://archive.ubuntu.com/ubuntu/dists/noble/{component}/binary-amd64/Packages.xz', CACHE / f'{component}-Packages.xz')
        for paragraph in lzma.decompress(archive).decode().split('\n\n'):
            values = dict(line.split(': ', 1) for line in paragraph.splitlines() if ': ' in line and not line.startswith(' '))
            if values.get('Package') in needed:
                packages[values['Package']] = {k: values[k] for k in ['Package', 'Version', 'Filename', 'SHA256']}
    index.write_text(json.dumps(packages, indent=2) + '\n')
missing = needed - packages.keys()
if missing:
    raise SystemExit(f'Official Ubuntu archive does not contain requested packages: {sorted(missing)}')
def extract(item):
    name, info = item
    file = CACHE / Path(info['Filename']).name
    data = download('https://archive.ubuntu.com/ubuntu/' + info['Filename'], file)
    if hashlib.sha256(data).hexdigest() != info['SHA256']:
        raise RuntimeError(f'Package checksum mismatch: {name}')
    with tempfile.TemporaryDirectory(prefix='webkit-library-', dir=CACHE) as temporary:
        folder = Path(temporary)
        members = subprocess.check_output(['ar', 't', str(file)], text=True).splitlines()
        payload = next(m for m in members if m.startswith('data.tar.'))
        (folder / payload).write_bytes(subprocess.check_output(['ar', 'p', str(file), payload]))
        extracted = folder / 'root'
        extracted.mkdir()
        subprocess.run(['bsdtar', '-xf', str(folder / payload), '-C', str(extracted)], check=True)
        for library in extracted.rglob('*.so*'):
            if library.is_file():
                if 'gstreamer-1.0' in library.parts:
                    if library.name in {'libgstinterleave.so', 'libgstid3demux.so', 'libgstmpg123.so', 'libgstautodetect.so', 'libgstpulseaudio.so', 'libgstaudioparsers.so'}:
                        shutil.copyfile(library.resolve(), PLUGINS / library.name)
                else:
                    shutil.copyfile(library.resolve(), LIBS / library.name)
    print(f'{name} {info["Version"]}: checksum verified, libraries extracted', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    list(executor.map(extract, [(name, packages[name]) for name in sorted(needed)]))
browser_launcher = Path(subprocess.check_output(['node', '--input-type=module', '-e', "import {webkit} from '@playwright/test';console.log(webkit.executablePath())"], cwd=ROOT, text=True).strip())
browser = browser_launcher.parent / 'minibrowser-wpe'
if not (browser / 'bin/MiniBrowser').is_file():
    raise SystemExit('Install the project-pinned Playwright WebKit binary first.')
wrapper = CACHE / 'webkit-compatible'
q = shlex.quote
wrapper.write_text('#!/bin/sh\n' + '\n'.join([
    f'export WEBKIT_EXEC_PATH={q(str(browser / "bin"))}',
    f'export WEBKIT_INJECTED_BUNDLE_PATH={q(str(browser / "lib"))}',
    f'export WEBKIT_INSPECTOR_RESOURCES_PATH={q(str(browser / "share"))}',
    f'export LD_LIBRARY_PATH={q(str(LIBS)+":"+str(browser/"lib")+":"+str(browser/"sys/lib"))}',
    f'export GST_PLUGIN_SYSTEM_PATH={q(str(PLUGINS)+":/usr/lib/gstreamer-1.0")}',
    f'export GST_PLUGIN_SCANNER=/usr/lib/gstreamer-1.0/gst-plugin-scanner',
    f'exec {q(str(browser / "bin/MiniBrowser"))} "$@"',
]) + '\n')
wrapper.chmod(0o755)
environment = dict(os.environ, LD_LIBRARY_PATH=str(LIBS)+':'+str(browser/'lib')+':'+str(browser/'sys/lib'))
linked = subprocess.run(['ldd', str(browser/'bin/MiniBrowser')], env=environment, capture_output=True, text=True)
unresolved = [line.strip() for line in linked.stdout.splitlines() if 'not found' in line]
if unresolved:
    raise SystemExit('Still missing compatible libraries: ' + '; '.join(unresolved))
print(f'Isolated executable: {wrapper}')
print('Run with CARPLAYGROUND_WEBKIT_EXECUTABLE set to that wrapper and PLAYWRIGHT_WEBKIT=1. This is Linux WebKit, not an iPad/Safari certification.')
