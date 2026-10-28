import os

_LOCAL_HOSTS = frozenset({'localhost', '127.0.0.1', '[::1]'})


def is_local_host(host):
    """Whether a Host header names this machine; refuses pages that reach the port under another name (DNS rebinding)."""
    host = (host or '').lower()
    if host.startswith('['):
        name = host.split(']', 1)[0] + ']'
    else:
        name = host.rsplit(':', 1)[0] if ':' in host else host
    return name in _LOCAL_HOSTS


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
