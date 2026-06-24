"""ClassQuiz (과목별 문제 풀) 공통 설정.

2022 개정 교육과정 중학교 주요 5과목 기준.
"""

# 과목 코드 -> 표시 이름
SUBJECTS = {
    'kor': '국어',
    'eng': '영어',
    'math': '수학',
    'social': '사회/역사',
    'sci': '과학',
}

# 과목 코드 -> 아이콘(이모지) — UI 카드용
SUBJECT_ICONS = {
    'kor': '📖',
    'eng': '🔤',
    'math': '📐',
    'social': '🗺️',
    'sci': '🔬',
}

# 학년 코드 -> 표시 이름
GRADES = {
    1: '중1',
    2: '중2',
    3: '중3',
}

# 한 세트에 출제되는 문제 수
QUESTIONS_PER_SET = 30

# 포인트 1점을 받기 위한 점수 (만점)
POINT_PERFECT_SCORE = 100


def is_valid_subject(code):
    return code in SUBJECTS


def is_valid_grade(grade):
    try:
        return int(grade) in GRADES
    except (TypeError, ValueError):
        return False
