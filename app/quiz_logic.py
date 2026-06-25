"""ClassQuiz 채점 로직."""


def _normalize(text):
    return str(text).strip().lower() if text is not None else ''


def grade_answer(question, response):
    """SubjectQuestion 한 문항에 대한 정오답 판정.

    - choice: 보기 번호 비교. 복수정답은 콤마(,)로 구분, 순서 무관.
    - short: 텍스트 비교(대소문자/공백 무시). 복수 정답은 '|'로 구분.
    """
    if response is None or str(response).strip() == '':
        return False

    correct = question.correct_answer or ''

    if question.q_type == 'choice':
        resp_set = {s.strip() for s in str(response).split(',') if s.strip()}
        correct_set = {s.strip() for s in str(correct).split(',') if s.strip()}
        return bool(correct_set) and resp_set == correct_set

    # short (단답)
    accepted = {_normalize(a) for a in str(correct).split('|') if a.strip()}
    return _normalize(response) in accepted
