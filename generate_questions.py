"""ClassQuiz 자동 생성 문제 적재 스크립트.

app/seeding 모듈을 사용하여 대량의 문제를 생성하여 DB에 적재한다.
생성 문제는 standard_code='AUTO' 로 표시되며, 재실행 시 기존 AUTO 문제만 삭제 후 다시 생성한다.

사용법:
    python generate_questions.py                # math 중1~3 각 1000개 생성
    python generate_questions.py 500            # 각 500개
    python generate_questions.py 1000 math 2    # math 중2만 1000개
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import create_app
from app.seeding import seed_generated

def main():
    explicit_n = None
    filter_subject = filter_grade = None
    args = sys.argv[1:]
    if args and args[0].isdigit():
        explicit_n = int(args[0]); args = args[1:]
    if args:
        filter_subject = args[0]
    if len(args) > 1:
        filter_grade = int(args[1])

    app = create_app()
    with app.app_context():
        print("[+] Starting auto questions generation...")
        total = seed_generated(filter_subject, filter_grade, explicit_n)
        print(f"[+] Completed! Total {total} auto-generated questions seeded.")

if __name__ == '__main__':
    main()
