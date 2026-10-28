"""
One-time setup: store the s0L monday app's Client ID and Secret, encrypted
for this Windows user. Run `npm run monday:provision` (hidden prompt), or
`--import monday-app.json` from an install script (the file is deleted).
"""
import argparse
import getpass
import json
import os
import sys

from core.features.integrations.monday import credentials


def _import(path):
    if not os.path.exists(path):
        print(f'No {path} found; skipping.')
        return 0
    try:
        with open(path, encoding='utf-8') as handle:
            data = json.load(handle)
        client_id = str(data.get('client_id') or '').strip()
        client_secret = str(data.get('client_secret') or '').strip()
    except (OSError, ValueError, AttributeError):
        client_id = client_secret = ''
    if not client_id or not client_secret:
        print(f'{path} is not a valid monday app file.')
        return 2
    credentials.save_app(client_id, client_secret)
    os.remove(path)
    print('Imported monday app credentials.')
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Store the s0L monday app's credentials for this Windows user.")
    parser.add_argument('--import', dest='import_path', metavar='PATH', help='import a monday-app.json, then delete it')
    args = parser.parse_args(argv)
    if args.import_path:
        return _import(args.import_path)

    client_id = input('monday Client ID: ').strip()
    client_secret = getpass.getpass('monday Client Secret (input hidden): ').strip()
    if not client_id or not client_secret:
        print('Both the Client ID and the Client Secret are needed.')
        return 1
    credentials.save_app(client_id, client_secret)
    print('Saved monday app credentials for this Windows user.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
