"""
The packaged app's front door: serves the built frontend and forwards /gssm-api to the
GSSM server, which is what the Vite dev server's proxy does in development.
"""
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Blueprint, Response, jsonify, request, send_from_directory
from werkzeug.security import safe_join

from core.shared.security import is_local_host

_RELAYED_HEADERS = ('Content-Type', 'Content-Disposition', 'Content-Length', 'Cache-Control')
_CHUNK = 64 * 1024
_API_PREFIXES = ('api/', 'gssm-api/')


def create_frontend_blueprint(dist_dir, gssm_origin='http://127.0.0.1:5175'):
    blueprint = Blueprint('frontend', __name__)

    @blueprint.route('/gssm-api/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
    def gssm_proxy(subpath):
        if not is_local_host(request.host):
            return jsonify({'error': 'Forbidden host'}), 403
        url = f'{gssm_origin}/{subpath}'
        if request.query_string:
            url = f'{url}?{request.query_string.decode("latin-1")}'
        upstream = Request(url, data=request.get_data() or None, method=request.method)
        if request.content_type:
            upstream.add_header('Content-Type', request.content_type)
        try:
            response = urlopen(upstream, timeout=300)
        except HTTPError as error:
            response = error
        except URLError:
            return jsonify({'error': 'The GSSM engine is not running.'}), 502
        headers = {name: response.headers.get(name) for name in _RELAYED_HEADERS if response.headers.get(name)}
        return Response(_stream(response), status=response.status, headers=headers)

    @blueprint.route('/', defaults={'path': ''})
    @blueprint.route('/<path:path>')
    def page(path):
        if path.startswith(_API_PREFIXES) or path in ('api', 'gssm-api'):
            return jsonify({'error': 'Not found'}), 404
        if path:
            target = safe_join(dist_dir, path)
            if target is None:
                return jsonify({'error': 'Not found'}), 404
            if os.path.isfile(target):
                return send_from_directory(dist_dir, path)
        return send_from_directory(dist_dir, 'index.html')

    return blueprint


def _stream(response):
    try:
        while True:
            chunk = response.read(_CHUNK)
            if not chunk:
                break
            yield chunk
    finally:
        response.close()
