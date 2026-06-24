"""ClassQuiz 문제 풀 시드 적재 스크립트.

app/seed_data/*.json 파일을 읽어 SubjectQuestion 테이블에 적재한다.
각 파일은 한 (과목, 학년) 풀을 나타내며, 적재 시 해당 과목·학년의 기존 문제를
모두 교체(sync)한다. 따라서 여러 번 실행해도 중복이 생기지 않는다.

사용법:
    python seed_questions.py            # app/seed_data 의 모든 파일 적재
    python seed_questions.py math 1     # 특정 과목/학년만 적재
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import create_app, db
from app.models import SubjectQuestion

SEED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app', 'seed_data')


def load_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def seed_one(data):
    subject = data['subject']
    grade = int(data['grade'])
    questions = data.get('questions', [])

    SubjectQuestion.query.filter_by(subject=subject, grade=grade).delete()

    for q in questions:
        options = q.get('options')
        if isinstance(options, list):
            options = ' | '.join(str(o) for o in options)
        db.session.add(SubjectQuestion(
            subject=subject,
            grade=grade,
            unit=q.get('unit'),
            standard_code=q.get('standard_code'),
            difficulty=int(q.get('difficulty', 2)),
            q_type=q.get('q_type', 'choice'),
            question=q['question'],
            options=options,
            correct_answer=str(q['correct_answer']),
            explanation=q.get('explanation'),
        ))
    db.session.commit()
    print(f"  [+] {subject} 중{grade}: {len(questions)}문제 적재 완료")


def main():
    app = create_app()
    with app.app_context():
        if not os.path.isdir(SEED_DIR):
            print(f"[-] 시드 폴더가 없습니다: {SEED_DIR}")
            return

        filter_subject = sys.argv[1] if len(sys.argv) > 1 else None
        filter_grade = sys.argv[2] if len(sys.argv) > 2 else None

        files = sorted(f for f in os.listdir(SEED_DIR) if f.endswith('.json'))
        if not files:
            print("[-] 적재할 JSON 시드 파일이 없습니다.")
            return

        print("[+] ClassQuiz 문제 풀 적재를 시작합니다...")
        total = 0
        for fname in files:
            data = load_file(os.path.join(SEED_DIR, fname))
            if filter_subject and data.get('subject') != filter_subject:
                continue
            if filter_grade and str(data.get('grade')) != str(filter_grade):
                continue
            seed_one(data)
            total += len(data.get('questions', []))

        print(f"[+] 완료! 총 {total}문제가 적재되었습니다.")


if __name__ == '__main__':
    main()
