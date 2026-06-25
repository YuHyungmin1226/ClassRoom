"""pytest 공용 픽스처.

실제 instance/app.db 를 건드리지 않도록 격리된 임시 SQLite DB를 사용한다.
DATABASE_URL 은 app(=config) 임포트 전에 설정해야 하므로 모듈 상단에서 지정한다.
"""
import os
import tempfile

_db_fd, _db_path = tempfile.mkstemp(suffix='.db')
os.close(_db_fd)
os.environ['DATABASE_URL'] = 'sqlite:///' + _db_path.replace('\\', '/')

import pytest  # noqa: E402
from app import create_app, db  # noqa: E402
from app.models import SubjectQuestion  # noqa: E402


@pytest.fixture()
def app():
    application = create_app()
    with application.app_context():
        db.drop_all()
        db.create_all()
        # 퀴즈 테스트용 최소 문제 풀(정답은 모두 보기 1번)
        for i in range(35):
            db.session.add(SubjectQuestion(
                subject='math', grade=1, q_type='choice',
                question=f'문항 {i}: 정답을 고르시오',
                options='정답 | 오답2 | 오답3 | 오답4',
                correct_answer='1', difficulty=1,
            ))
        db.session.commit()
        yield application
        db.session.remove()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def admin_client(app):
    c = app.test_client()
    with c.session_transaction() as s:
        s['admin_logged_in'] = True
    return c
