"""문제 풀 시드 적재 공용 로직.

CLI 스크립트(seed_questions.py / generate_questions.py)와 앱 최초 실행 시
자동 시드(run.py)가 이 모듈을 공유한다. 모든 함수는 활성 app context 안에서 호출.
"""
import os
import json

from . import db
from .models import SubjectQuestion
from .quiz_generators import generate as _gen_param, AUTO_TAG
from .quiz_knowledge import generate_knowledge as _gen_knowledge

SEED_DIR = os.path.join(os.path.dirname(__file__), 'seed_data')

KNOWLEDGE_SUBJECTS = ('kor', 'sci', 'social')
# 과목별 기본 자동 생성 개수(영어·지식 과목은 사전 크기에서 자연 제한)
SUBJECT_N = {'math': 270}
DEFAULT_N = 1000
SUPPORTED = [(s, g) for s in ('math', 'eng', 'kor', 'sci', 'social') for g in (1, 2, 3)]


def _insert(s, g, q, default_type):
    options = q.get('options')
    if isinstance(options, list):
        options = ' | '.join(str(o) for o in options)
    db.session.add(SubjectQuestion(
        subject=s, grade=g,
        unit=q.get('unit'), standard_code=q.get('standard_code'),
        difficulty=int(q.get('difficulty', 2)),
        q_type=q.get('q_type', default_type),
        question=q['question'], options=options,
        correct_answer=str(q['correct_answer']),
        explanation=q.get('explanation'),
    ))


def seed_curated(subject=None, grade=None):
    """seed_data/*.json 의 큐레이션 문제를 (과목,학년)별로 동기화 적재."""
    if not os.path.isdir(SEED_DIR):
        return 0
    total = 0
    for fname in sorted(os.listdir(SEED_DIR)):
        if not fname.endswith('.json'):
            continue
        with open(os.path.join(SEED_DIR, fname), 'r', encoding='utf-8') as f:
            data = json.load(f)
        s, g = data['subject'], int(data['grade'])
        if (subject and s != subject) or (grade and g != grade):
            continue
        SubjectQuestion.query.filter_by(subject=s, grade=g).delete()
        print(f"  -> Curated seed: {s} Grade {g} ({len(data.get('questions', []))} questions)... ", end="", flush=True)
        for q in data.get('questions', []):
            _insert(s, g, q, 'choice')
            total += 1
        print("Done")
    db.session.commit()
    return total


def _generate(subject, grade, n):
    if subject in KNOWLEDGE_SUBJECTS:
        return _gen_knowledge(subject, grade, n)
    return _gen_param(subject, grade, n)


def seed_generated(subject=None, grade=None, n_override=None):
    """자동 생성 문제(AUTO)를 (과목,학년)별로 재생성 적재. 큐레이션은 보존."""
    total = 0
    for s, g in SUPPORTED:
        if (subject and s != subject) or (grade and g != grade):
            continue
        n = n_override if n_override is not None else SUBJECT_N.get(s, DEFAULT_N)
        SubjectQuestion.query.filter_by(subject=s, grade=g, standard_code=AUTO_TAG).delete()
        print(f"  -> Auto generating: {s} Grade {g} ({n} questions)... ", end="", flush=True)
        questions = _generate(s, g, n)
        for q in questions:
            _insert(s, g, q, 'short')
            total += 1
        print(f"Done ({len(questions)} generated)")
    db.session.commit()
    return total


def seed_if_empty():
    """문제 풀이 비어 있으면(최초 실행 등) 큐레이션 + 자동 생성으로 채운다."""
    if SubjectQuestion.query.count() > 0:
        return False
    print('[seed] Database is empty. Seeding initial questions... (This might take a moment)', flush=True)
    c = seed_curated()
    g = seed_generated()
    print(f'[seed] Completed: Curated {c} + Auto {g} = Total {c + g} questions', flush=True)
    return True
