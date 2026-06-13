import os
import secrets

basedir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'instance', 'app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'check_same_thread': False},
    }
    UPLOAD_FOLDER = os.path.join(basedir, 'app', 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB limit
    ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', '').split(',') if os.environ.get('ALLOWED_ORIGINS') else None
