"""
`npm run release`: build the signed package and publish it to s0L's release item on monday.
The version is one patch above the newest zip there (or package.json's, if higher); it is
written to package.json. Git is never touched.
"""
import argparse
import json
import os
import re
import subprocess
import sys

from core.features.integrations.monday import client, config, oauth, releases

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
PACKAGE_JSON = os.path.join(REPO_ROOT, 'package.json')
RELEASE_DIR = os.path.join(REPO_ROOT, 'release')
BUILD_SCRIPT = os.path.join(REPO_ROOT, 'packaging', 'build.ps1')
_VERSION_LINE = re.compile(r'^(\s*"version"\s*:\s*")([^"]*)(")', re.MULTILINE)


def next_version(on_monday, in_package, requested=None):
    """The version to publish: the requested one (if newer than monday's), else monday's + 1 patch or package.json's."""
    if requested is not None:
        if on_monday is not None and requested <= on_monday:
            raise ValueError('s0L %d.%d.%d is already on monday; ask for a newer version.' % on_monday)
        return requested
    if on_monday is None:
        return in_package
    return max((on_monday[0], on_monday[1], on_monday[2] + 1), in_package)


def write_package_version(path, version):
    """Replace only package.json's top-level version, keeping every other byte."""
    with open(path, encoding='utf-8', newline='') as handle:
        text = handle.read()
    updated, count = _VERSION_LINE.subn(lambda match: match.group(1) + version + match.group(3), text, count=1)
    if not count:
        raise ValueError('package.json has no "version" line.')
    with open(path, 'w', encoding='utf-8', newline='') as handle:
        handle.write(updated)


def _package_version():
    with open(PACKAGE_JSON, encoding='utf-8') as handle:
        return releases.parse_version(json.load(handle).get('version')) or (0, 0, 0)


def _run_build():
    subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', BUILD_SCRIPT],
                   cwd=REPO_ROOT, check=True)


def main(argv=None, *, run_build=None):
    parser = argparse.ArgumentParser(prog='npm run release', description='Build, sign and publish s0L to monday.')
    parser.add_argument('--version', help='publish this MAJOR.MINOR.PATCH instead of the next one')
    args = parser.parse_args(argv)

    state = oauth.status()
    if not state['connected'] or not state['can_write']:
        print('Connect monday again in s0L (the monday icon at the top) with a sign-in that may change boards, '
              'then run this again.')
        return 1
    requested = None
    if args.version:
        requested = releases.parse_version(args.version)
        if requested is None:
            print('--version must look like 1.2.3.')
            return 1
    try:
        newest = releases.latest_release()
        version = next_version(newest['version'] if newest else None, _package_version(), requested)
    except ValueError as error:
        print(error)
        return 1
    except (client.MondayError, releases.ReleaseError) as error:
        print(f"Could not read s0L's release item: {error}")
        return 1

    text = '%d.%d.%d' % version
    write_package_version(PACKAGE_JSON, text)
    print(f'Building s0L {text} (signed)...')
    try:
        (run_build or _run_build)()
    except (subprocess.CalledProcessError, OSError) as error:
        print(f'The build failed ({error}); nothing was published.')
        return 1
    archive = os.path.join(RELEASE_DIR, f's0L-{text}.zip')
    if not os.path.isfile(archive):
        print(f'The build did not produce {archive}; nothing was published.')
        return 1

    print(f'Uploading {os.path.basename(archive)} to monday...')
    try:
        releases.upload(archive)
        newest = releases.latest_release()
    except (client.MondayError, releases.ReleaseError) as error:
        print(f'{error}\nYou can drag {archive} into the Files column of the s0L item instead: {config.RELEASE_BOARD_URL}')
        return 1
    if not newest or newest['version'] != version:
        print(f"The upload finished, but monday doesn't list s0L {text} yet. Check the s0L item: {config.RELEASE_BOARD_URL}")
        return 1
    print(f'Published s0L {text} to monday.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
