from flask import Flask, jsonify, request
from flask_cors import CORS

from core.features.deals.deals import deals_blueprint
from core.features.documents.documents import documents_blueprint
from core.features.settings.settings import settings_blueprint
from core.features.calendar.calendar import calendar_blueprint
from core.shared.security import parse_frontend_origins


def create_app():
    app = Flask(__name__)

    CORS(app, resources={
        r'/*': {
            'origins': parse_frontend_origins(),
            'methods': ['GET', 'POST', 'PUT', 'DELETE'],
            'allow_headers': ['Content-Type'],
            'max_age': 3600
        }
    })

    app.config['DEBUG'] = False
    app.config['TESTING'] = False

    @app.before_request
    def restrict_to_localhost():
        if request.remote_addr not in ['127.0.0.1', 'localhost', '::1']:
            return jsonify({'error': 'Forbidden: Access restricted to localhost only'}), 403

    @app.after_request
    def add_security_headers(response):
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Permissions-Policy'] = (
            'geolocation=(), '
            'microphone=(), '
            'camera=(), '
            'payment=(), '
            'usb=(), '
            'magnetometer=(), '
            'accelerometer=(), '
            'gyroscope=()'
        )
        return response

    app.register_blueprint(deals_blueprint)
    app.register_blueprint(documents_blueprint)
    app.register_blueprint(settings_blueprint)
    app.register_blueprint(calendar_blueprint)

    return app
