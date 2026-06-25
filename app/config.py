import os
import secrets

basedir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


def _load_or_create_secret():
    """SECRET_KEY를 환경변수 → instance/secret_key 파일 순으로 영속화한다.

    매 실행 랜덤 생성하면 서버 재시작마다 세션(관리자 로그인·게임 결제 권한)이
    모두 무효화되므로, 파일에 한 번 생성해 두고 재사용한다.
    instance/ 는 .gitignore 대상이라 비밀키가 저장소에 커밋되지 않는다.
    """
    env = os.environ.get('SECRET_KEY')
    if env:
        return env
    key_path = os.path.join(basedir, 'instance', 'secret_key')
    try:
        if os.path.exists(key_path):
            with open(key_path, 'r') as f:
                saved = f.read().strip()
            if saved:
                return saved
        os.makedirs(os.path.dirname(key_path), exist_ok=True)
        new_key = secrets.token_hex(32)
        with open(key_path, 'w') as f:
            f.write(new_key)
        return new_key
    except Exception:
        # 파일 접근 불가 시에도 동작은 하도록(이 경우에만 재시작 시 세션 초기화)
        return secrets.token_hex(32)


class Config:
    SECRET_KEY = _load_or_create_secret()
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'instance', 'app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'check_same_thread': False},
    }
    UPLOAD_FOLDER = os.path.join(basedir, 'app', 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB limit
    ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', '').split(',') if os.environ.get('ALLOWED_ORIGINS') else None
