"""ClassQuiz 문제 자동 생성기.

수학처럼 정답이 계산으로 보장되는 과목은 파라미터를 무작위로 바꿔
대량의 '정확한' 문제를 생성할 수 있다. 생성된 문제는 standard_code='AUTO'
로 표시하여, 손으로 만든 큐레이션 문제(standard_code=None)와 구분한다.

지식 기반 과목(국어/사회/과학)은 사실 오류 위험이 있어 자동 생성하지 않는다.
"""
import random

AUTO_TAG = 'AUTO'


def _neg(n):
    """음수는 괄호로 감싸 식을 명확히 표기(양수는 맨숫자). 대수식 항에 사용."""
    return f"({n})" if n < 0 else f"{n}"


def _sgn(n):
    """정수 사칙연산용: 양수는 (+n), 음수는 (-n)으로 부호를 명시(중1 교과서식)."""
    return f"(+{n})" if n > 0 else f"({n})"


def _nz(lo, hi, exclude=(0,)):
    """[lo, hi]에서 exclude에 든 값을 제외한 정수 하나를 무작위로 반환."""
    return random.choice([x for x in range(lo, hi + 1) if x not in exclude])


def _linexpr(m, n, var='x'):
    """일차식 'mx + n' 을 보기 좋게 표기. 예: 3x - 5, -x + 2, x."""
    if m == 1:
        mx = var
    elif m == -1:
        mx = f"-{var}"
    else:
        mx = f"{m}{var}"
    if n == 0:
        return mx
    return f"{mx} + {n}" if n > 0 else f"{mx} - {-n}"


def _quadexpr(b, c):
    """이차식 'x² + bx + c' 를 보기 좋게 표기."""
    s = "x²"
    if b == 1:
        s += " + x"
    elif b == -1:
        s += " - x"
    elif b > 0:
        s += f" + {b}x"
    elif b < 0:
        s += f" - {-b}x"
    if c > 0:
        s += f" + {c}"
    elif c < 0:
        s += f" - {-c}"
    return s


def _factor(a):
    """일차 인수 '(x ± a)' 표기 (a != 0 가정)."""
    return f"(x + {a})" if a > 0 else f"(x - {-a})"


def _mk(unit, difficulty, question, answer, q_type='short', options=None, explanation=None):
    return {
        'unit': unit,
        'standard_code': AUTO_TAG,
        'difficulty': difficulty,
        'q_type': q_type,
        'question': question,
        'options': options,
        'correct_answer': str(answer),
        'explanation': explanation or f"정답: {answer}",
    }


# ----------------------------- 중1 -----------------------------

def _g1_add():
    a, b = _nz(-20, 20), _nz(-20, 20)
    return _mk("정수와 유리수", 1, f"{_sgn(a)} + {_sgn(b)} 를 계산하면?", a + b)


def _g1_sub():
    a, b = _nz(-20, 20), _nz(-20, 20)
    return _mk("정수와 유리수", 1, f"{_sgn(a)} - {_sgn(b)} 를 계산하면?", a - b)


def _g1_mul():
    a, b = _nz(-12, 12, (-1, 0, 1)), _nz(-12, 12, (-1, 0, 1))
    return _mk("정수와 유리수", 1, f"{_sgn(a)} × {_sgn(b)} 를 계산하면?", a * b)


def _g1_div():
    b = _nz(-12, 12, (-1, 0, 1))   # 나누는 수: 0, ±1 제외(자명한 나눗셈 방지)
    q = _nz(-12, 12)               # 몫: 0 제외(피제수 0 방지)
    a = b * q
    return _mk("정수와 유리수", 2, f"{_sgn(a)} ÷ {_sgn(b)} 를 계산하면?", q)


def _g1_pow():
    base = _nz(-5, 5, (-1, 0, 1))  # 밑: 0, ±1 제외(자명한 거듭제곱 방지)
    e = random.choice([2, 3])
    sym = '²' if e == 2 else '³'
    return _mk("정수와 유리수", 2, f"{_neg(base)}{sym} 을 계산하면?", base ** e)


def _g1_abs():
    a = _nz(-30, 30)
    return _mk("정수와 유리수", 1, f"|{a}| 의 값은?", abs(a))


def _g1_linear():
    a = random.randint(2, 9)
    x = random.randint(-9, 9)
    b = random.randint(-9, 9)
    c = a * x + b
    return _mk("일차방정식", 2, f"일차방정식 {_linexpr(a, b)} = {c} 의 해 x는?", x)


def _g1_eval():
    m = random.choice([x for x in range(-9, 10) if x != 0])
    n = random.randint(-9, 9)
    x = random.randint(-9, 9)
    return _mk("문자와 식", 2, f"x = {x} 일 때, {_linexpr(m, n)} 의 값은?", m * x + n)


# ----------------------------- 중2 -----------------------------

def _g2_exp_mul():
    a = random.randint(1, 4)
    b = random.randint(1, 4)
    return _mk("식의 계산", 1, f"2^{a} × 2^{b} 의 값은?", 2 ** (a + b),
               explanation=f"지수를 더한다: 2^{a + b} = {2 ** (a + b)}")


def _g2_exp_pow():
    a = random.randint(1, 3)
    b = random.randint(1, 3)
    return _mk("식의 계산", 2, f"(2^{a})^{b} 의 값은?", 2 ** (a * b),
               explanation=f"지수를 곱한다: 2^{a * b} = {2 ** (a * b)}")


def _g2_inequality():
    k = random.randint(1, 20)
    c = 2 * k
    return _mk("일차부등식", 2, f"부등식 2x < {c} 의 해가 x < □ 일 때, □에 들어갈 수는?", k,
               explanation=f"양변을 2로 나누면 x < {k}")


def _g2_system():
    x = random.randint(-9, 9)
    y = random.randint(-9, 9)
    s, d = x + y, x - y
    return _mk("연립일차방정식", 2,
               f"연립방정식 x+y={s}, x-y={d} 에서 x의 값은?", x,
               explanation=f"두 식을 더하면 2x={s + d}, x={x}")


def _g2_slope():
    p = random.randint(1, 9)
    slope = random.choice([x for x in range(-5, 6) if x != 0])
    q = p * slope
    return _mk("일차함수", 2,
               f"두 점 (0, 0), ({p}, {q}) 를 지나는 직선의 기울기는?", slope,
               explanation=f"기울기 = {q}/{p} = {slope}")


def _g2_func_eval():
    a = random.choice([x for x in range(-5, 6) if x != 0])
    b = random.randint(-9, 9)
    x = random.randint(-9, 9)
    return _mk("일차함수", 2,
               f"일차함수 y = {_linexpr(a, b)} 에서 x = {x} 일 때 y의 값은?", a * x + b)


# ----------------------------- 중3 -----------------------------

def _g3_sqrt():
    n = random.randint(2, 20)
    return _mk("제곱근과 실수", 1, f"√{n * n} 의 값은?", n)


def _g3_sqrt_mul():
    n = random.randint(2, 12)
    return _mk("근호를 포함한 식", 2, f"√{n} × √{n} 의 값은?", n,
               explanation=f"√{n} × √{n} = {n}")


def _g3_quad():
    n = random.randint(2, 15)
    return _mk("이차방정식", 2, f"이차방정식 x² = {n * n} 의 양의 해는?", n)


def _g3_sum_roots():
    r1 = random.randint(-9, 9)
    r2 = random.randint(-9, 9)
    b = -(r1 + r2)
    c = r1 * r2
    return _mk("이차방정식", 3,
               f"이차방정식 {_quadexpr(b, c)} = 0 의 두 근의 합은?", r1 + r2,
               explanation=f"두 근의 합 = -({b}) = {r1 + r2}")


def _g3_prod_roots():
    r1 = random.randint(-9, 9)
    r2 = random.randint(-9, 9)
    b = -(r1 + r2)
    c = r1 * r2
    return _mk("이차방정식", 3,
               f"이차방정식 {_quadexpr(b, c)} = 0 의 두 근의 곱은?", r1 * r2,
               explanation=f"두 근의 곱 = {c}")


def _g3_expand_eval():
    a = random.choice([v for v in range(-9, 10) if v != 0])
    b = random.choice([v for v in range(-9, 10) if v != 0])
    x = random.randint(-9, 9)
    return _mk("다항식의 곱셈", 2,
               f"x = {x} 일 때, {_factor(a)}{_factor(b)} 의 값은?", (x + a) * (x + b))


_PYTHAG = [(3, 4, 5), (6, 8, 10), (5, 12, 13), (8, 15, 17), (9, 12, 15),
          (7, 24, 25), (20, 21, 29), (9, 40, 41), (12, 16, 20), (10, 24, 26)]


def _g3_pythag():
    a, b, c = random.choice(_PYTHAG)
    if random.random() < 0.5:
        a, b = b, a
    return _mk("피타고라스 정리", 2,
               f"직각을 낀 두 변의 길이가 {a}, {b} 인 직각삼각형의 빗변의 길이는?", c,
               explanation=f"√({a}² + {b}²) = {c}")


_GENERATORS = {
    1: [_g1_add, _g1_sub, _g1_mul, _g1_div, _g1_pow, _g1_abs, _g1_linear, _g1_eval],
    2: [_g2_exp_mul, _g2_exp_pow, _g2_inequality, _g2_system, _g2_slope, _g2_func_eval],
    3: [_g3_sqrt, _g3_sqrt_mul, _g3_quad, _g3_sum_roots, _g3_prod_roots, _g3_expand_eval, _g3_pythag],
}


def generate_math(grade, n):
    """수학 grade 학년의 자동 생성 문제 n개를 (질문 텍스트 기준) 중복 없이 반환."""
    return _collect(_GENERATORS.get(int(grade), []), n)


# ===================== 영어 (검증된 사전 기반) =====================
# 문법 규칙상 정답이 확정되는 유형만 생성한다.

# 규칙 복수형(-s만 붙이는 안전한 명사: s/x/z/ch/sh, 자음+y, o, f 로 끝나지 않음)
_REG_NOUNS = [
    'book', 'pen', 'desk', 'car', 'dog', 'cat', 'bird', 'hand', 'room', 'table',
    'apple', 'river', 'school', 'friend', 'song', 'game', 'door', 'window', 'king',
    'queen', 'girl', 'boy', 'ball', 'tree', 'star', 'cloud', 'flower', 'house',
    'phone', 'clock', 'cup', 'chair', 'bag', 'hat', 'coat', 'ring', 'road', 'train',
    'plane', 'ship', 'lake', 'hill', 'field', 'garden', 'letter', 'number', 'picture',
    'computer', 'teacher', 'student', 'doctor', 'farmer', 'singer', 'player', 'driver',
    'worker', 'leader', 'reader', 'painter', 'dancer', 'writer',
]

_IRREG_PAST = {
    'go': 'went', 'eat': 'ate', 'see': 'saw', 'come': 'came', 'run': 'ran',
    'make': 'made', 'take': 'took', 'give': 'gave', 'get': 'got', 'write': 'wrote',
    'buy': 'bought', 'bring': 'brought', 'think': 'thought', 'teach': 'taught',
    'find': 'found', 'tell': 'told', 'say': 'said', 'do': 'did', 'have': 'had',
    'know': 'knew', 'leave': 'left', 'meet': 'met', 'sit': 'sat', 'stand': 'stood',
    'win': 'won', 'sing': 'sang', 'drink': 'drank', 'swim': 'swam', 'fly': 'flew',
    'draw': 'drew', 'speak': 'spoke', 'break': 'broke', 'choose': 'chose',
    'drive': 'drove', 'ride': 'rode', 'wear': 'wore', 'begin': 'began', 'fall': 'fell',
    'feel': 'felt', 'keep': 'kept', 'sleep': 'slept', 'send': 'sent', 'spend': 'spent',
    'lose': 'lost', 'build': 'built', 'catch': 'caught',
}

_PAST_PARTICIPLE = {
    'go': 'gone', 'eat': 'eaten', 'see': 'seen', 'write': 'written', 'take': 'taken',
    'give': 'given', 'do': 'done', 'make': 'made', 'break': 'broken', 'speak': 'spoken',
    'choose': 'chosen', 'drive': 'driven', 'ride': 'ridden', 'know': 'known',
    'grow': 'grown', 'throw': 'thrown', 'fly': 'flown', 'draw': 'drawn', 'sing': 'sung',
    'drink': 'drunk', 'swim': 'swum', 'begin': 'begun', 'find': 'found', 'buy': 'bought',
    'bring': 'brought', 'think': 'thought', 'teach': 'taught', 'sit': 'sat', 'win': 'won',
    'fall': 'fallen', 'wear': 'worn', 'keep': 'kept', 'sleep': 'slept', 'send': 'sent',
    'lose': 'lost', 'build': 'built', 'catch': 'caught', 'come': 'come', 'run': 'run',
    'read': 'read', 'say': 'said', 'tell': 'told', 'leave': 'left', 'meet': 'met',
    'stand': 'stood',
}

_COMPARATIVE = {
    'tall': 'taller', 'short': 'shorter', 'old': 'older', 'young': 'younger',
    'fast': 'faster', 'slow': 'slower', 'small': 'smaller', 'high': 'higher',
    'low': 'lower', 'strong': 'stronger', 'long': 'longer', 'cold': 'colder',
    'warm': 'warmer', 'cheap': 'cheaper', 'clean': 'cleaner', 'kind': 'kinder',
    'smart': 'smarter', 'hard': 'harder', 'new': 'newer', 'near': 'nearer',
    'deep': 'deeper', 'light': 'lighter', 'dark': 'darker', 'weak': 'weaker',
    'rich': 'richer', 'poor': 'poorer', 'soft': 'softer', 'quick': 'quicker',
    'bright': 'brighter', 'big': 'bigger', 'hot': 'hotter', 'fat': 'fatter',
    'thin': 'thinner', 'sad': 'sadder', 'wet': 'wetter', 'happy': 'happier',
    'easy': 'easier', 'busy': 'busier', 'early': 'earlier', 'heavy': 'heavier',
    'pretty': 'prettier', 'lucky': 'luckier', 'good': 'better', 'bad': 'worse',
    'far': 'farther',
}

_LONG_ADJ = [
    'beautiful', 'difficult', 'important', 'expensive', 'interesting', 'popular',
    'famous', 'dangerous', 'delicious', 'wonderful', 'careful', 'useful', 'exciting',
    'comfortable', 'intelligent', 'helpful',
]

_BE_IS = ['He', 'She', 'It', 'Tom', 'Mary', 'The boy', 'My friend', 'My mother',
          'My father', 'This', 'My teacher', 'The dog']
_BE_ARE = ['You', 'We', 'They', 'The boys', 'My friends', 'Tom and I', 'These', 'Those']

_AN_WORDS = ['apple', 'orange', 'egg', 'elephant', 'ant', 'idea', 'item', 'onion',
             'animal', 'artist', 'actor', 'office', 'umbrella', 'uncle', 'island',
             'eye', 'ear', 'arm', 'eagle', 'owl']
_A_WORDS = ['book', 'dog', 'cat', 'pen', 'car', 'desk', 'house', 'table', 'ball',
            'tree', 'king', 'queen', 'girl', 'boy', 'hat', 'cup', 'bag', 'door',
            'phone', 'clock', 'banana', 'lion', 'tiger', 'rabbit', 'monkey']

_REL_PEOPLE = ['a friend', 'a boy', 'the girl', 'the man', 'the woman', 'a teacher',
               'the doctor', 'a student', 'the singer', 'a player']
_REL_THINGS = ['a book', 'the car', 'a house', 'a pen', 'the table', 'a movie',
               'the song', 'a box', 'the city', 'a flower']


def _e_be():
    if random.random() < 0.2:
        subj, ans = 'I', 'am'
    elif random.random() < 0.5:
        subj, ans = random.choice(_BE_IS), 'is'
    else:
        subj, ans = random.choice(_BE_ARE), 'are'
    opts = ['am', 'is', 'are', 'be']
    return _mk("be동사", 1, f"빈칸에 알맞은 be동사는?  {subj} ___ happy.",
               opts.index(ans) + 1, q_type='choice', options=' | '.join(opts),
               explanation=f"정답: {ans}")


def _e_plural():
    n = random.choice(_REG_NOUNS)
    return _mk("명사의 복수형", 1, f"명사 '{n}'의 복수형을 쓰시오.", n + 's')


def _e_past():
    v = random.choice(list(_IRREG_PAST))
    return _mk("동사의 과거형", 2, f"동사 '{v}'의 과거형을 쓰시오.", _IRREG_PAST[v])


def _e_pp():
    v = random.choice(list(_PAST_PARTICIPLE))
    return _mk("과거분사", 2, f"동사 '{v}'의 과거분사(p.p.)를 쓰시오.", _PAST_PARTICIPLE[v])


def _e_comp():
    a = random.choice(list(_COMPARATIVE))
    return _mk("비교급", 2, f"형용사 '{a}'의 비교급을 쓰시오.", _COMPARATIVE[a])


def _e_long_comp():
    a = random.choice(_LONG_ADJ)
    return _mk("비교급", 2, f"형용사 '{a}'의 비교급을 쓰시오.", 'more ' + a,
               explanation=f"3음절 이상 형용사는 more 를 붙입니다: more {a}")


def _e_a_an():
    if random.random() < 0.5:
        w, ans = random.choice(_AN_WORDS), 'an'
    else:
        w, ans = random.choice(_A_WORDS), 'a'
    opts = ['a', 'an']
    return _mk("관사", 1, f"빈칸에 알맞은 관사는?  I have ___ {w}.",
               opts.index(ans) + 1, q_type='choice', options=' | '.join(opts),
               explanation=f"정답: {ans} {w}")


def _e_rel():
    if random.random() < 0.5:
        ante, ans = random.choice(_REL_PEOPLE), 'who'
        kind = '사람'
    else:
        ante, ans = random.choice(_REL_THINGS), 'which'
        kind = '사물'
    opts = ['who', 'which', 'whose', 'where']
    return _mk("관계대명사", 3,
               f"선행사가 '{ante}' ({kind})일 때 빈칸에 알맞은 관계대명사는?  This is {ante} ___ I like.",
               opts.index(ans) + 1, q_type='choice', options=' | '.join(opts),
               explanation=f"{kind} 선행사에는 {ans} 를 씁니다.")


# 어휘(영→한) — 뜻이 서로 겹치지 않도록 구성(보기 중복 방지)
_VOCAB = {
    'school': '학교', 'teacher': '선생님', 'student': '학생', 'book': '책', 'pencil': '연필',
    'desk': '책상', 'chair': '의자', 'window': '창문', 'door': '문', 'house': '집',
    'family': '가족', 'mother': '어머니', 'father': '아버지', 'friend': '친구', 'dog': '개',
    'cat': '고양이', 'bird': '새', 'fish': '물고기', 'lion': '사자', 'tiger': '호랑이',
    'rabbit': '토끼', 'monkey': '원숭이', 'elephant': '코끼리', 'apple': '사과', 'banana': '바나나',
    'grape': '포도', 'water': '물', 'milk': '우유', 'bread': '빵', 'egg': '달걀',
    'sugar': '설탕', 'salt': '소금', 'hand': '손', 'foot': '발', 'head': '머리',
    'eye': '눈', 'ear': '귀', 'nose': '코', 'mouth': '입', 'sun': '태양',
    'moon': '달', 'star': '별', 'sky': '하늘', 'cloud': '구름', 'rain': '비',
    'wind': '바람', 'sea': '바다', 'river': '강', 'mountain': '산', 'tree': '나무',
    'flower': '꽃', 'road': '길', 'city': '도시', 'country': '나라', 'train': '기차',
    'bus': '버스', 'car': '자동차', 'plane': '비행기', 'ship': '배', 'money': '돈',
    'time': '시간', 'color': '색깔', 'music': '음악', 'picture': '그림', 'story': '이야기',
    'question': '질문', 'answer': '대답', 'name': '이름', 'number': '숫자', 'word': '단어',
    'paper': '종이', 'computer': '컴퓨터', 'phone': '전화', 'clock': '시계', 'key': '열쇠',
    'bag': '가방', 'hat': '모자', 'shoe': '신발', 'doctor': '의사', 'nurse': '간호사',
    'farmer': '농부', 'king': '왕', 'queen': '여왕', 'ball': '공', 'run': '달리다',
    'walk': '걷다', 'swim': '수영하다', 'sing': '노래하다', 'dance': '춤추다', 'eat': '먹다',
    'drink': '마시다', 'sleep': '자다', 'buy': '사다', 'sell': '팔다', 'give': '주다',
    'help': '돕다', 'love': '사랑하다', 'know': '알다', 'see': '보다', 'speak': '말하다',
}

# 3인칭 단수 현재형(불규칙 포함 명시 사전)
_THIRD = {
    'play': 'plays', 'like': 'likes', 'want': 'wants', 'run': 'runs', 'eat': 'eats',
    'read': 'reads', 'sleep': 'sleeps', 'walk': 'walks', 'jump': 'jumps', 'sing': 'sings',
    'help': 'helps', 'work': 'works', 'talk': 'talks', 'open': 'opens', 'close': 'closes',
    'love': 'loves', 'live': 'lives', 'give': 'gives', 'take': 'takes', 'make': 'makes',
    'come': 'comes', 'see': 'sees', 'know': 'knows', 'go': 'goes', 'do': 'does',
    'watch': 'watches', 'wash': 'washes', 'teach': 'teaches', 'study': 'studies',
    'cry': 'cries', 'fly': 'flies', 'try': 'tries', 'have': 'has', 'say': 'says', 'buy': 'buys',
}

# 현재분사/동명사 -ing (명시 사전)
_ING = {
    'go': 'going', 'play': 'playing', 'eat': 'eating', 'read': 'reading', 'sing': 'singing',
    'help': 'helping', 'walk': 'walking', 'jump': 'jumping', 'talk': 'talking', 'work': 'working',
    'study': 'studying', 'watch': 'watching', 'open': 'opening', 'sleep': 'sleeping',
    'run': 'running', 'swim': 'swimming', 'sit': 'sitting', 'get': 'getting', 'put': 'putting',
    'begin': 'beginning', 'make': 'making', 'take': 'taking', 'come': 'coming', 'write': 'writing',
    'ride': 'riding', 'dance': 'dancing', 'give': 'giving', 'live': 'living', 'use': 'using',
    'drive': 'driving',
}


def _e_vocab():
    w = random.choice(list(_VOCAB))
    correct = _VOCAB[w]
    others = list({m for m in _VOCAB.values() if m != correct})
    random.shuffle(others)
    opts = [correct] + others[:3]
    random.shuffle(opts)
    return _mk("어휘", 1, f"단어 '{w}'의 뜻으로 알맞은 것은?",
               opts.index(correct) + 1, q_type='choice', options=' | '.join(opts),
               explanation=f"{w} = {correct}")


def _e_third():
    v = random.choice(list(_THIRD))
    return _mk("동사 - 3인칭 단수", 2, f"동사 '{v}'의 3인칭 단수 현재형을 쓰시오.", _THIRD[v])


def _e_ing():
    v = random.choice(list(_ING))
    return _mk("현재분사·동명사", 2, f"동사 '{v}'에 -ing 를 붙인 형태를 쓰시오.", _ING[v])


_ENG_GENERATORS = {
    1: [_e_be, _e_plural, _e_past, _e_a_an, _e_vocab, _e_third],
    2: [_e_comp, _e_long_comp, _e_pp, _e_past, _e_ing, _e_third],
    3: [_e_pp, _e_long_comp, _e_rel, _e_comp, _e_vocab, _e_ing],
}


def generate_english(grade, n):
    return _collect(_ENG_GENERATORS.get(int(grade), []), n)


def _collect(gens, n):
    """생성기 목록에서 질문 텍스트 기준 중복 없이 최대 n개 수집."""
    if not gens:
        return []
    out, seen, attempts = [], set(), 0
    limit = n * 80
    while len(out) < n and attempts < limit:
        attempts += 1
        q = random.choice(gens)()
        if q['question'] in seen:
            continue
        seen.add(q['question'])
        out.append(q)
    return out


def generate(subject, grade, n):
    if subject == 'math':
        return generate_math(grade, n)
    if subject == 'eng':
        return generate_english(grade, n)
    return []
