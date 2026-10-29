import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from core.features.deals.deals import deals_blueprint
from core.features.documents.documents import documents_blueprint
from core.features.settings.settings import settings_blueprint
from core.features.calendar.calendar import calendar_blueprint
from core.features.integrations.monday.routes import monday_blueprint
from core.features.integrations.salesforce.routes import salesforce_blueprint
from core.features.integrations.outlook.routes import outlook_blueprint
from core.features.integrations.client_logos.routes import client_logos_blueprint
from core.features.notices.notices import notices_blueprint
from core.shared.security import parse_frontend_origins
from core.shell.frontend import create_frontend_blueprint
from core.shell.updates import updates_blueprint


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
    app.register_blueprint(monday_blueprint)
    app.register_blueprint(salesforce_blueprint)
    app.register_blueprint(outlook_blueprint)
    app.register_blueprint(client_logos_blueprint)
    app.register_blueprint(notices_blueprint)
    app.register_blueprint(updates_blueprint)

    dist_dir = os.environ.get('S0L_FRONTEND_DIST', '').strip()
    if dist_dir and os.path.isfile(os.path.join(dist_dir, 'index.html')):
        app.register_blueprint(create_frontend_blueprint(dist_dir))

    return app
