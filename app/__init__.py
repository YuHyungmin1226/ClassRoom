import os
import secrets
import shutil
import sqlite3
import stat
import tempfile

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from flask_wtf.csrf import CSRFProtect
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from .config import Config

db = SQLAlchemy()
socketio = SocketIO(async_mode='threading')
csrf = CSRFProtect()


def _paths_overlap(first, second):
    first = os.path.normcase(os.path.abspath(os.fspath(first)))
    second = os.path.normcase(os.path.abspath(os.fspath(second)))
    try:
        common = os.path.commonpath((first, second))
    except ValueError:
        return False
    return common == first or common == second


def _move_regular_file_exclusive(source, destination):
    """Copy a regular file without replacing an existing destination."""
    source_flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0)
    source_flags |= getattr(os, 'O_NOFOLLOW', 0)
    source_fd = os.open(source, source_flags)
    with os.fdopen(source_fd, 'rb') as source_file:
        source_stat = os.fstat(source_file.fileno())
        if not stat.S_ISREG(source_stat.st_mode):
            return False

        destination_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        destination_flags |= getattr(os, 'O_BINARY', 0)
        destination_fd = os.open(
            destination,
            destination_flags,
            stat.S_IMODE(source_stat.st_mode),
        )
        try:
            with os.fdopen(destination_fd, 'wb') as destination_file:
                shutil.copyfileobj(source_file, destination_file)
        except BaseException:
            try:
                os.unlink(destination)
            except OSError:
                pass
            raise

    try:
        os.unlink(source)
    except OSError:
        return False
    return True


def migrate_legacy_uploads(legacy_folder, upload_folder, quarantine_root):
    """Move legacy public uploads into private storage without data loss.

    The whole legacy path is renamed into quarantine before any entry is
    inspected. Only top-level regular files with unused names are migrated;
    every other entry remains in the returned quarantine path.
    """
    if _paths_overlap(legacy_folder, upload_folder):
        raise ValueError('Legacy and destination upload folders must be separate.')
    if _paths_overlap(legacy_folder, quarantine_root):
        raise ValueError('Legacy uploads and quarantine must be separate.')
    if not os.path.lexists(legacy_folder):
        return None

    os.makedirs(quarantine_root, exist_ok=True)
    quarantine_container = tempfile.mkdtemp(
        prefix='legacy-uploads-',
        dir=quarantine_root,
    )
    quarantine_path = os.path.join(quarantine_container, 'contents')
    try:
        os.replace(legacy_folder, quarantine_path)
    except FileNotFoundError:
        # Another process may have completed the startup migration first.
        os.rmdir(quarantine_container)
        return None
    except OSError:
        os.rmdir(quarantine_container)
        raise

    quarantine_stat = os.lstat(quarantine_path)
    is_junction = getattr(os.path, 'isjunction', lambda _path: False)
    if (
        not stat.S_ISDIR(quarantine_stat.st_mode)
        or os.path.islink(quarantine_path)
        or is_junction(quarantine_path)
    ):
        return quarantine_path

    os.makedirs(upload_folder, exist_ok=True)
    with os.scandir(quarantine_path) as entries:
        for entry in entries:
            try:
                is_regular_file = entry.is_file(follow_symlinks=False)
            except OSError:
                continue
            if not is_regular_file:
                continue
            try:
                _move_regular_file_exclusive(
                    entry.path,
                    os.path.join(upload_folder, entry.name),
                )
            except OSError:
                # Collisions and failed copies remain safely quarantined.
                continue

    try:
        os.rmdir(quarantine_path)
    except OSError:
        return quarantine_path
    os.rmdir(quarantine_container)
    return None


@event.listens_for(Engine, 'connect')
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    if not isinstance(dbapi_connection, sqlite3.Connection):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute('PRAGMA foreign_keys=ON')
    cursor.close()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    if _paths_overlap(app.static_folder, app.config['UPLOAD_FOLDER']):
        raise ValueError('UPLOAD_FOLDER must be outside the public static folder.')
    if _paths_overlap(
        app.config['LEGACY_UPLOAD_FOLDER'],
        app.config['UPLOAD_FOLDER'],
    ):
        raise ValueError('Legacy and destination upload folders must be separate.')

    # Detach legacy uploads from the public static tree before inspecting them.
    os.makedirs(app.instance_path, exist_ok=True)
    quarantine_path = None
    if not app.config.get('TESTING'):
        quarantine_path = migrate_legacy_uploads(
            app.config['LEGACY_UPLOAD_FOLDER'],
            app.config['UPLOAD_FOLDER'],
            os.path.join(app.instance_path, 'upload-quarantine'),
        )
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    if quarantine_path:
        app.logger.warning(
            'Legacy upload leftovers were retained in private quarantine: %s',
            quarantine_path,
        )

    db.init_app(app)
    # None keeps Flask-SocketIO's same-origin check. Cross-origin access is only
    # enabled when ALLOWED_ORIGINS is explicitly configured.
    socketio.init_app(
        app,
        cors_allowed_origins=app.config.get('ALLOWED_ORIGINS'),
    )
    csrf.init_app(app)

    with app.app_context():
        from . import models
        db.create_all()

        # Initialize default admin if not exists.
        # 하드코딩된 기본 비밀번호 대신 ADMIN_PASSWORD 환경변수를 사용하고,
        # 없으면 1회용 임의 비밀번호를 생성해 콘솔에 출력한다(반드시 변경 안내).
        admin = models.Admin.query.first()
        if not admin:
            initial_password = app.config.get('ADMIN_PASSWORD')
            generated = False
            if not initial_password:
                initial_password = secrets.token_urlsafe(12)
                generated = True
            # A fixed primary key turns concurrent first-start initialization
            # into one winner plus a harmless uniqueness conflict.
            default_admin = models.Admin(id=1)
            default_admin.set_password(initial_password)
            db.session.add(default_admin)
            try:
                db.session.commit()
            except IntegrityError:
                db.session.rollback()
                generated = False
            if generated:
                print(f"[보안] 초기 관리자 비밀번호: {initial_password}")
                print("       최초 로그인 후 즉시 변경하세요. (환경변수 ADMIN_PASSWORD로 지정 가능)")

        from .routes import main
        app.register_blueprint(main)
        from . import events  # noqa: F401 - import registers Socket.IO handlers

    @app.after_request
    def set_security_headers(response):
        # MIME 스니핑으로 업로드 파일을 다른 콘텐츠 타입으로 오인 실행하는 것을 방지
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    return app
