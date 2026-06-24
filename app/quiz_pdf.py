"""ClassQuiz 결과 PDF 생성 (reportlab)."""
import io
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

from .quiz_config import SUBJECTS, GRADES

_FONT_NAME = 'Helvetica'  # 한글 폰트 등록 실패 시 폴백
_FONT_REGISTERED = False

# 한글 지원 TTF 후보 경로 (Windows / macOS / Linux / 번들)
_FONT_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), 'static', 'fonts', 'NanumGothic.ttf'),
    r'C:\Windows\Fonts\malgun.ttf',
    r'C:\Windows\Fonts\malgunsl.ttf',
    '/System/Library/Fonts/AppleSDGothicNeo.ttc',
    '/Library/Fonts/AppleGothic.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
]


def _ensure_font():
    """한글 폰트를 1회 등록하고 폰트 이름을 반환."""
    global _FONT_NAME, _FONT_REGISTERED
    if _FONT_REGISTERED:
        return _FONT_NAME

    for path in _FONT_CANDIDATES:
        if not os.path.exists(path):
            continue
        try:
            if path.lower().endswith('.ttc'):
                pdfmetrics.registerFont(TTFont('KoreanFont', path, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont('KoreanFont', path))
            _FONT_NAME = 'KoreanFont'
            break
        except Exception as e:
            print(f"[quiz_pdf] 폰트 등록 실패 {path}: {e}")

    _FONT_REGISTERED = True
    if _FONT_NAME == 'Helvetica':
        print("[quiz_pdf] 경고: 한글 폰트를 찾지 못했습니다. PDF에서 한글이 깨질 수 있습니다. "
              "app/static/fonts/NanumGothic.ttf 를 추가하세요.")
    return _FONT_NAME


def _styles(font_name):
    base = getSampleStyleSheet()
    styles = {
        'title': ParagraphStyle('qz_title', parent=base['Title'], fontName=font_name, fontSize=20, spaceAfter=4),
        'sub': ParagraphStyle('qz_sub', parent=base['Normal'], fontName=font_name, fontSize=10, textColor=colors.HexColor('#64748b')),
        'h2': ParagraphStyle('qz_h2', parent=base['Heading2'], fontName=font_name, fontSize=13, spaceBefore=10, spaceAfter=6),
        'q': ParagraphStyle('qz_q', parent=base['Normal'], fontName=font_name, fontSize=10.5, leading=15),
        'meta': ParagraphStyle('qz_meta', parent=base['Normal'], fontName=font_name, fontSize=9, textColor=colors.HexColor('#64748b')),
        'cell': ParagraphStyle('qz_cell', parent=base['Normal'], fontName=font_name, fontSize=9.5, leading=13),
    }
    return styles


def _option_label(question, value):
    """객관식 응답 번호를 '번호(보기내용)' 형태로 변환."""
    if question.q_type != 'choice' or not value:
        return value or '-'
    opts = [o.strip() for o in (question.options or '').split('|')]
    parts = []
    for v in str(value).split(','):
        v = v.strip()
        if not v:
            continue
        try:
            idx = int(v) - 1
            parts.append(f"{v}. {opts[idx]}" if 0 <= idx < len(opts) else v)
        except ValueError:
            parts.append(v)
    return ', '.join(parts) if parts else '-'


def build_result_pdf(attempt, question_map, answer_map, total_points=None):
    """결과 PDF를 BytesIO로 반환.

    attempt: QuizAttempt
    question_map: {question_id: SubjectQuestion}
    answer_map: {question_id: AttemptAnswer}
    total_points: 학생 누적 포인트(선택)
    """
    font_name = _ensure_font()
    styles = _styles(font_name)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title='ClassQuiz 결과',
    )

    subject_name = SUBJECTS.get(attempt.subject, attempt.subject)
    grade_name = GRADES.get(attempt.grade, attempt.grade)

    elems = []
    elems.append(Paragraph('ClassQuiz 결과지', styles['title']))
    elems.append(Paragraph(f"{subject_name} · {grade_name}", styles['sub']))
    elems.append(Spacer(1, 8))

    # 요약 박스
    when = attempt.created_at.strftime('%Y-%m-%d %H:%M') if attempt.created_at else '-'
    summary_rows = [
        ['이름', attempt.nickname or '-', '점수', f"{attempt.score}점"],
        ['정답 수', f"{attempt.correct_count} / {attempt.total}",
         '만점 여부', '⭐ 만점 (+1 point)' if attempt.is_perfect else '미달'],
        ['응시 일시', when, '누적 포인트', f"{total_points}" if total_points is not None else '-'],
    ]
    if attempt.is_retry:
        summary_rows.append(['유형', '오답 재풀이', '', ''])
    summary = Table(
        [[Paragraph(str(c), styles['cell']) for c in row] for row in summary_rows],
        colWidths=[28 * mm, 55 * mm, 28 * mm, 55 * mm],
    )
    summary.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#f1f5f9')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elems.append(summary)
    elems.append(Spacer(1, 12))

    # 문항별 상세
    elems.append(Paragraph('문항별 결과', styles['h2']))

    header = [Paragraph(h, styles['cell']) for h in ['#', '문제', '내 답안', '정답', '결과']]
    data = [header]
    wrong_rows = []  # 오답 행 인덱스(채점 결과로 직접 추적)
    qids = _ordered_qids(attempt)
    for i, qid in enumerate(qids, start=1):
        q = question_map.get(qid)
        a = answer_map.get(qid)
        if not q:
            continue
        my_ans = _option_label(q, a.response if a else None)
        correct = _option_label(q, q.correct_answer)
        ok = a.is_correct if a else False
        data.append([
            Paragraph(str(i), styles['cell']),
            Paragraph(_strip_md(q.question), styles['cell']),
            Paragraph(str(my_ans), styles['cell']),
            Paragraph(str(correct), styles['cell']),
            Paragraph('O' if ok else 'X', styles['cell']),
        ])
        if not ok:
            wrong_rows.append(len(data) - 1)

    table = Table(data, colWidths=[8 * mm, 78 * mm, 35 * mm, 35 * mm, 12 * mm], repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366f1')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('ALIGN', (4, 0), (4, -1), 'CENTER'),
    ]
    # 오답 행 배경 강조
    for ridx in wrong_rows:
        style.append(('BACKGROUND', (0, ridx), (-1, ridx), colors.HexColor('#fef2f2')))
    table.setStyle(TableStyle(style))
    elems.append(table)

    doc.build(elems)
    buf.seek(0)
    return buf


def _ordered_qids(attempt):
    import json
    try:
        return json.loads(attempt.question_ids)
    except (TypeError, ValueError):
        return []


def _strip_md(text):
    """PDF 표시는 평문 위주이므로 간단히 이미지 마크다운만 치환."""
    import re
    if not text:
        return ''
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '[이미지]', text)
    return text
