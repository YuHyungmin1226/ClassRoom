from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from flask_wtf.csrf import CSRFProtect
from .config import Config

db = SQLAlchemy()
socketio = SocketIO(async_mode='threading',
                    cors_allowed_origins=Config.ALLOWED_ORIGINS or "*")
csrf = CSRFProtect()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    import os
    import secrets
    # Ensure instance and upload directories exist
    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    db.init_app(app)
    socketio.init_app(app)
    csrf.init_app(app)

    with app.app_context():
        from . import models
        db.create_all()

        # Initialize default admin if not exists.
        # 하드코딩된 기본 비밀번호 대신 ADMIN_PASSWORD 환경변수를 사용하고,
        # 없으면 1회용 임의 비밀번호를 생성해 콘솔에 출력한다(반드시 변경 안내).
        admin = models.Admin.query.first()
        if not admin:
            initial_password = os.environ.get('ADMIN_PASSWORD')
            generated = False
            if not initial_password:
                initial_password = secrets.token_urlsafe(12)
                generated = True
            default_admin = models.Admin()
            default_admin.set_password(initial_password)
            db.session.add(default_admin)
            db.session.commit()
            if generated:
                print(f"[보안] 초기 관리자 비밀번호: {initial_password}")
                print("       최초 로그인 후 즉시 변경하세요. (환경변수 ADMIN_PASSWORD로 지정 가능)")

        from .routes import main
        app.register_blueprint(main)
        from . import events

    @app.after_request
    def set_security_headers(response):
        # MIME 스니핑으로 업로드 파일을 다른 콘텐츠 타입으로 오인 실행하는 것을 방지
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    return app
