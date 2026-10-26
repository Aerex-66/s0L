import os


def parse_frontend_origins():
    configured = os.environ.get('FRONTEND_ORIGINS', '').strip()
    if configured:
        return [origin.strip() for origin in configured.split(',') if origin.strip()]

    frontend_port = os.environ.get('FRONTEND_PORT', '5120')
    return [
        f'http://localhost:{frontend_port}',
        f'http://127.0.0.1:{frontend_port}',
        f'http://[::1]:{frontend_port}',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://[::1]:5173',
    ]
