"""ClassQuiz 문제 풀 시드 적재 스크립트.

app/seeding 모듈을 사용하여 app/seed_data/*.json 파일을 읽어 SubjectQuestion 테이블에 적재한다.
적재 시 해당 과목·학년의 기존 문제를 모두 교체(sync)한다.

사용법:
    python seed_questions.py            # app/seed_data 의 모든 파일 적재
    python seed_questions.py math 1     # 특정 과목/학년만 적재
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import create_app
from app.seeding import seed_curated

def main():
    app = create_app()
    with app.app_context():
        filter_subject = sys.argv[1] if len(sys.argv) > 1 else None
        filter_grade_raw = sys.argv[2] if len(sys.argv) > 2 else None
        filter_grade = int(filter_grade_raw) if filter_grade_raw and filter_grade_raw.isdigit() else None

        print("[+] Starting ClassQuiz questions seeding...")
        total = seed_curated(filter_subject, filter_grade)
        print(f"[+] Completed! Total {total} questions seeded.")

if __name__ == '__main__':
    main()
