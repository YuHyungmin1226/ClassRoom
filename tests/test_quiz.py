import json
from app import db
from app.models import QuizAttempt, SubjectQuestion


def _correct_answers(app, attempt_id):
    with app.app_context():
        att = db.session.get(QuizAttempt, attempt_id)
        qids = json.loads(att.question_ids)
        qmap = {q.id: q for q in SubjectQuestion.query.filter(SubjectQuestion.id.in_(qids)).all()}
    return {str(qid): qmap[qid].correct_answer for qid in qids}


def test_start_returns_30_without_answers(client):
    r = client.post('/api/quiz/start', json={'subject': 'math', 'grade': 1, 'client_id': 't1'})
    assert r.status_code == 200
    d = r.get_json()
    assert d['total'] == 30 and len(d['questions']) == 30
    assert all('correct_answer' not in q for q in d['questions'])  # 정답 미노출


def test_invalid_subject_grade(client):
    assert client.post('/api/quiz/start', json={'subject': 'nope', 'grade': 1, 'client_id': 'x'}).status_code == 400
    assert client.post('/api/quiz/start', json={'subject': 'math', 'grade': 9, 'client_id': 'x'}).status_code == 400


def test_perfect_awards_one_point(client, app):
    d = client.post('/api/quiz/start', json={'subject': 'math', 'grade': 1, 'client_id': 't2'}).get_json()
    ans = _correct_answers(app, d['attempt_id'])
    r = client.post('/api/quiz/submit', json={'attempt_id': d['attempt_id'], 'client_id': 't2', 'answers': ans}).get_json()
    assert r['score'] == 100 and r['is_perfect'] and r['point_awarded'] and r['total_points'] == 1


def test_resubmit_blocked(client, app):
    d = client.post('/api/quiz/start', json={'subject': 'math', 'grade': 1, 'client_id': 't3'}).get_json()
    ans = _correct_answers(app, d['attempt_id'])
    client.post('/api/quiz/submit', json={'attempt_id': d['attempt_id'], 'client_id': 't3', 'answers': ans})
    again = client.post('/api/quiz/submit', json={'attempt_id': d['attempt_id'], 'client_id': 't3', 'answers': ans})
    assert again.status_code == 409


def test_retry_wrong(client):
    d = client.post('/api/quiz/start', json={'subject': 'math', 'grade': 1, 'client_id': 't4'}).get_json()
    r = client.post('/api/quiz/submit', json={'attempt_id': d['attempt_id'], 'client_id': 't4', 'answers': {}}).get_json()
    assert r['score'] == 0 and r['wrong_count'] == 30
    rr = client.post('/api/quiz/retry_wrong', json={'attempt_id': d['attempt_id'], 'client_id': 't4'})
    assert rr.status_code == 200 and rr.get_json()['total'] == 30


def test_points_default_zero(client):
    assert client.get('/api/quiz/points?client_id=nobody').get_json()['points'] == 0
