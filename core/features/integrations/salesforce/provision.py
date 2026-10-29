"""
One-time setup: store s0L's Salesforce app for this Windows user: the org's
My Domain address and the app's Consumer Key (neither is a secret; PKCE takes
the place of a client secret). Run `npm run salesforce:provision`. Only an app
marked as IBM Sales Cloud is bundled into the packaged s0L; a test org never is.
"""
import sys

from core.features.integrations.salesforce import credentials


def _host(text):
    host = str(text or '').strip().lower()
    for prefix in ('https://', 'http://'):
        if host.startswith(prefix):
            host = host[len(prefix):]
    return host.rstrip('/')


def main():
    host = _host(input('Salesforce My Domain address (like yourcompany.my.salesforce.com): '))
    if not credentials.valid_host(host):
        print('That is not a Salesforce address: it must end in .salesforce.com or .force.com.')
        return 1
    client_id = input("Consumer Key of s0L's Salesforce app: ").strip()
    if not client_id:
        print('The Consumer Key is needed.')
        return 1
    release = input('Is this IBM Sales Cloud, the app colleagues will use? [y/N]: ').strip().lower() in ('y', 'yes')
    credentials.save_app(host, client_id, release=release)
    kept = 'bundled into the packaged s0L' if release else 'a test org: never bundled into the packaged s0L'
    print(f'Saved the Salesforce app for {host} ({kept}).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
