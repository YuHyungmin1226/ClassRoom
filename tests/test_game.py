import json
from app import db
from app.models import QuizAttempt, SubjectQuestion


def _earn_one_point(client, app, cid):
    d = client.post('/api/quiz/start', json={'subject': 'math', 'grade': 1, 'client_id': cid}).get_json()
    with app.app_context():
        att = db.session.get(QuizAttempt, d['attempt_id'])
        qids = json.loads(att.question_ids)
        qmap = {q.id: q for q in SubjectQuestion.query.filter(SubjectQuestion.id.in_(qids)).all()}
    ans = {str(qid): qmap[qid].correct_answer for qid in qids}
    client.post('/api/quiz/submit', json={'attempt_id': d['attempt_id'], 'client_id': cid, 'answers': ans})


def test_old_static_path_removed(client):
    assert client.get('/static/games/likedia/index.html').status_code == 404


def test_files_blocked_without_payment(client):
    # 진입 페이지와 하위 리소스 모두 미결제 시 차단
    assert client.get('/play/likedia/').status_code == 403
    assert client.get('/play/likedia/style.css').status_code == 403
    assert client.get('/play/likedia/js/game.js').status_code == 403


def test_insufficient_points(client):
    r = client.post('/api/game/play', json={'game': 'likedia', 'client_id': 'broke'}).get_json()
    assert r['ok'] is False and r['reason'] == 'insufficient'


def test_pay_grants_access_and_deducts(client, app):
    _earn_one_point(client, app, 'gp1')
    r = client.post('/api/game/play', json={'game': 'likedia', 'client_id': 'gp1'}).get_json()
    assert r['ok'] and r['remaining'] == 0
    assert client.get('/play/likedia/').status_code == 200  # 같은 세션은 결제 권한 보유


def test_admin_plays_free_and_unlimited(admin_client):
    assert admin_client.get('/play/likedia/').status_code == 200  # 결제 없이도 접근
    r = admin_client.post('/api/game/play', json={'game': 'likedia', 'client_id': 'adm'}).get_json()
    assert r['ok'] and r.get('admin') is True and r['cost'] == 0


def test_grant_points_admin_only(client, admin_client, app):
    _earn_one_point(client, app, 'stu1')
    g = admin_client.post('/admin/grant_points', json={'amount': 3}).get_json()
    assert g['ok'] and g['students'] >= 1
    assert client.get('/api/quiz/points?client_id=stu1').get_json()['points'] == 4
    assert client.post('/admin/grant_points', json={'amount': 3}).status_code == 401  # 비관리자 차단
