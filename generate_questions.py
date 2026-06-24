"""ClassQuiz 자동 생성 문제 적재 스크립트.

app/quiz_generators.py 의 생성기로 대량의 문제를 만들어 DB에 넣는다.
생성 문제는 standard_code='AUTO' 로 표시되며, 재실행 시 해당 과목·학년의
기존 AUTO 문제만 삭제 후 다시 생성한다(손으로 만든 큐레이션 문제는 보존).

사용법:
    python generate_questions.py                # math 중1~3 각 1000개 생성
    python generate_questions.py 500            # 각 500개
    python generate_questions.py 1000 math 2    # math 중2만 1000개
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import create_app, db
from app.models import SubjectQuestion
from app.quiz_generators import generate, AUTO_TAG

# 현재 자동 생성을 지원하는 (과목, 학년)
SUPPORTED = [
    ('math', 1), ('math', 2), ('math', 3),
    ('eng', 1), ('eng', 2), ('eng', 3),
]


def fill(subject, grade, n):
    SubjectQuestion.query.filter_by(subject=subject, grade=grade, standard_code=AUTO_TAG).delete()
    questions = generate(subject, grade, n)
    for q in questions:
        db.session.add(SubjectQuestion(
            subject=subject, grade=grade,
            unit=q.get('unit'), standard_code=q.get('standard_code'),
            difficulty=int(q.get('difficulty', 2)),
            q_type=q.get('q_type', 'short'),
            question=q['question'],
            options=q.get('options'),
            correct_answer=str(q['correct_answer']),
            explanation=q.get('explanation'),
        ))
    db.session.commit()
    print(f"  [+] {subject} 중{grade}: 자동 생성 {len(questions)}문제 적재 (요청 {n})")
    return len(questions)


def main():
    n = 1000
    filter_subject = filter_grade = None
    args = sys.argv[1:]
    if args and args[0].isdigit():
        n = int(args[0]); args = args[1:]
    if args:
        filter_subject = args[0]
    if len(args) > 1:
        filter_grade = int(args[1])

    app = create_app()
    with app.app_context():
        print(f"[+] 자동 생성 문제 적재 시작 (셀당 {n}개)...")
        total = 0
        for subject, grade in SUPPORTED:
            if filter_subject and subject != filter_subject:
                continue
            if filter_grade and grade != filter_grade:
                continue
            total += fill(subject, grade, n)
        print(f"[+] 완료! 자동 생성 문제 총 {total}개 적재.")


if __name__ == '__main__':
    main()
