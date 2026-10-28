#!/usr/bin/env python3
"""
Deal Tracker API entrypoint.
"""

import os

from core.app_factory import create_app
from core.features.calendar.calendar import cache_file
from core.features.calendar.outlook_sync import outlook_available, start_outlook_sync


app = create_app()


if __name__ == '__main__':
    if os.environ.get('S0L_OUTLOOK_SYNC') == '1' and outlook_available():
        start_outlook_sync(cache_file())

    frontend_port = os.environ.get('FRONTEND_PORT', '5120')
    print('\n' + '=' * 60)
    print('DEAL TRACKER API'.center(60))
    print('=' * 60)
    print('\nAPI running at http://localhost:5121')
    print(f'Frontend at http://localhost:{frontend_port}')
    print('Press Ctrl+C to quit')
    print('\nSECURITY: Localhost-only mode enabled')
    print('External connections blocked')
    print('No internet access required or permitted\n')

    app.run(
        host='127.0.0.1',
        port=5121,
        debug=False,
        threaded=True,
        use_reloader=False,
    )
