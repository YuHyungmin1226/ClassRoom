import os
import secrets

basedir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


def _load_or_create_secret_key():
    """SECRET_KEY 결정 우선순위:
    1) 환경변수 SECRET_KEY (운영 권장)
    2) instance/secret_key 파일 (없으면 생성) — 재시작해도 세션 유지
    매 부팅마다 무작위로 생성하면 기존 로그인 세션이 모두 무효화되므로 파일에 보존한다.
    """
    env_key = os.environ.get('SECRET_KEY')
    if env_key:
        return env_key
    instance_dir = os.path.join(basedir, 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    key_path = os.path.join(instance_dir, 'secret_key')
    try:
        if os.path.exists(key_path):
            with open(key_path, 'r', encoding='utf-8') as f:
                stored = f.read().strip()
                if stored:
                    return stored
        new_key = secrets.token_hex(32)
        with open(key_path, 'w', encoding='utf-8') as f:
            f.write(new_key)
        return new_key
    except OSError:
        # 파일 시스템 접근 실패 시에도 동작은 유지 (세션 지속성만 포기)
        return secrets.token_hex(32)


class Config:
    SECRET_KEY = _load_or_create_secret_key()
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'instance', 'app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'check_same_thread': False},
    }
    UPLOAD_FOLDER = os.path.join(basedir, 'app', 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB limit
    ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', '').split(',') if os.environ.get('ALLOWED_ORIGINS') else None
    # 세션 쿠키 보안 강화 (CSRF 완화에 도움)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
