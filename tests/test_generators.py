import re
from app.quiz_generators import generate_math
from app.quiz_knowledge import generate_knowledge

_NUM = r'\(?[+-]?\d+\)?'


def _pv(s):
    return int(s.replace('(', '').replace(')', ''))


def test_math_distinct_and_no_trivial():
    qs = generate_math(1, 60)
    assert len(qs) == 60
    assert len(set(q['question'] for q in qs)) == 60  # 중복 없음
    # 자명한 나눗셈(÷1, ÷-1, 0÷)이 없어야 함
    for q in qs:
        assert ' ÷ (+1) ' not in q['question']
        assert ' ÷ (-1) ' not in q['question']
        assert not q['question'].startswith('(+0)') and not q['question'].startswith('0 ÷')


def test_math_arithmetic_correct():
    qs = generate_math(1, 200)
    checked = 0
    for q in qs:
        t = q['question']
        for op, fn in [('+', lambda a, b: a + b), ('-', lambda a, b: a - b), ('×', lambda a, b: a * b)]:
            m = re.match(rf'^({_NUM}) \{op} ({_NUM}) ' if op == '+' else rf'^({_NUM}) {op} ({_NUM}) ', t)
            if m:
                assert fn(_pv(m.group(1)), _pv(m.group(2))) == int(q['correct_answer'])
                checked += 1
        m = re.match(rf'^({_NUM}) ÷ ({_NUM}) ', t)
        if m:
            assert int(_pv(m.group(1)) / _pv(m.group(2))) == int(q['correct_answer'])
            checked += 1
    assert checked > 0  # 사칙연산 문항이 실제로 검증됨


def test_knowledge_options_unique_and_valid():
    qs = generate_knowledge('sci', 1, 20)
    assert len(qs) > 0
    for q in qs:
        opts = [o for o in q['options'].split('|')]
        opts = [o.strip() for o in opts]
        assert len(opts) == 4 and len(set(opts)) == 4  # 보기 4개 모두 고유
        assert 1 <= int(q['correct_answer']) <= 4
