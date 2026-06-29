from flask_socketio import emit, join_room, leave_room
from . import socketio, db
from .models import Flag, QuizQuestion, QuizResponse, Session
from flask import request, session


def _admin_room(session_id):
    """관리자 전용 하위 룸 이름 — 학생 응답을 학생끼리 보지 못하도록 분리"""
    return f"{session_id}:admins"


def _serialize_question(q, include_answer):
    """퀴즈 문제 직렬화. 정답(correct_answer)은 관리자에게만 포함.
    학생에게는 정답을 숨기되, 객관식 복수정답 여부(is_multi)는 UI 렌더에 필요하므로 전달한다.
    """
    data = {
        'id': q.id,
        'index': q.index,
        'q_type': q.q_type,
        'question': q.question,
        'options': q.options,
        'is_multi': bool(q.correct_answer and ',' in q.correct_answer),
    }
    if include_answer:
        data['correct_answer'] = q.correct_answer
    return data


def _serialize_flag(f):
    return {
        'id': f.id,
        'region_id': f.region_id,
        'x': f.x,
        'y': f.y,
        'text_content': f.text_content,
        'file_path': f.file_path,
        'thumbnail_path': f.thumbnail_path,
        'author_name': f.author_name,
        'client_id': f.client_id,
        'post_type': f.post_type,
        'created_at': f.created_at.isoformat() if f.created_at else None,
    }


def _normalize_answer(value):
    return str(value or '').strip().lower()


def _choice_answer_values(question, response_text):
    """Return canonical option numbers for a choice answer."""
    raw_values = [part.strip() for part in str(response_text or '').split(',') if part.strip()]
    if not raw_values:
        return []

    options = [part.strip() for part in (question.options or '').split('|')]
    option_lookup = {_normalize_answer(option): str(idx + 1) for idx, option in enumerate(options)}
    values = []
    for raw in raw_values:
        if raw.isdigit():
            idx = int(raw) - 1
            if 0 <= idx < len(options):
                values.append(str(idx + 1))
        else:
            option_idx = option_lookup.get(_normalize_answer(raw))
            if option_idx:
                values.append(option_idx)
    return sorted(set(values))


def _current_participant_id():
    """서버가 신뢰하는 참여자 식별자.
    view_session(HTTP) 진입 시 Flask 세션에 저장된 서명된 값으로, 위조가 불가능하다.
    클라이언트가 보낸 client_id는 신뢰하지 않는다.
    """
    return session.get('participant_id')

@socketio.on('join')
def on_join(data):
    room = data.get('session_id')
    if not room:
        return

    is_admin = session.get('admin_logged_in', False)

    # 세션 존재/활성 여부 검증 — 닫혔거나 없는 세션은 비관리자에게 데이터 미제공
    sess = Session.query.get(room)
    if not sess or (not sess.is_active and not is_admin):
        emit('join_rejected', {'session_id': room}, to=request.sid)
        return

    join_room(room)
    if is_admin:
        join_room(_admin_room(room))

    # Send existing flags to the user who just joined
    flags = Flag.query.filter_by(session_id=room).all()
    flags_data = [_serialize_flag(f) for f in flags]
    emit('load_flags', flags_data, to=request.sid)

    # Quiz Questions — 정답은 관리자에게만 포함
    questions = QuizQuestion.query.filter_by(session_id=room).order_by(QuizQuestion.index).all()
    q_data = [_serialize_question(q, is_admin) for q in questions]
    emit('load_quiz_questions', q_data, to=request.sid)

    if is_admin:
        # 관리자에게는 전체 응답 전송
        responses = QuizResponse.query.filter_by(session_id=room).all()
        r_data = [{
            'id': r.id,
            'question_id': r.question_id,
            'client_id': r.client_id,
            'author_name': r.author_name,
            'response': r.response,
            'is_correct': r.is_correct
        } for r in responses]
        emit('load_all_responses', r_data, to=request.sid)
    else:
        # 학생에게는 본인 응답만 복원 (새로고침 시 답안/채점 상태 유지)
        pid = _current_participant_id() or data.get('client_id')
        if pid:
            my = QuizResponse.query.filter_by(session_id=room, client_id=pid).all()
            my_data = [{
                'question_id': r.question_id,
                'response': r.response,
                'is_correct': r.is_correct
            } for r in my]
            emit('load_my_responses', my_data, to=request.sid)

@socketio.on('leave')
def on_leave(data):
    room = data['session_id']
    leave_room(room)

@socketio.on('add_flag')
def on_add_flag(data):
    session_id = data.get('session_id')
    region_id = data.get('region_id')
    x = data.get('x')
    y = data.get('y')
    text_content = data.get('text_content')
    file_path = data.get('file_path')
    thumbnail_path = data.get('thumbnail_path')
    author_name = data.get('author_name', 'Participant')
    # 소유자 식별은 서버가 신뢰하는 participant_id 사용 (클라이언트 위조 방지).
    # 세션 값이 없을 때만(예외적) 클라이언트 값으로 폴백.
    client_id = _current_participant_id() or data.get('client_id')
    post_type = data.get('post_type', 'normal')

    # Permission check: Only admin can create notice or objective
    is_admin = session.get('admin_logged_in', False)
    if not is_admin and post_type in ['notice', 'objective']:
        post_type = 'normal'

    new_flag = Flag(
        session_id=session_id,
        region_id=region_id,
        x=x,
        y=y,
        text_content=text_content,
        file_path=file_path,
        thumbnail_path=thumbnail_path,
        author_name=author_name,
        client_id=client_id,
        post_type=post_type
    )
    db.session.add(new_flag)
    db.session.commit()

    flag_data = _serialize_flag(new_flag)
    
    # Broadcast to everyone in the room (session)
    emit('new_flag', flag_data, to=session_id)

@socketio.on('edit_flag')
def on_edit_flag(data):
    session_id = data.get('session_id')
    flag_id = data.get('flag_id')
    
    flag = Flag.query.get(flag_id)
    if flag:
        # Authorization check: Admin or the person who created the flag
        is_admin = session.get('admin_logged_in', False)
        requester_client_id = _current_participant_id() or data.get('client_id')

        # Permission check:
        # 1. If it's a notice or objective, ONLY admin can edit.
        # 2. Otherwise, admin OR the owner can edit.
        is_special_type = flag.post_type in ['notice', 'objective']
        
        if is_special_type:
            if not is_admin:
                print(f"Unauthorized edit attempt for special type {flag.post_type} by client {requester_client_id}")
                return
        else:
            if not is_admin and flag.client_id != requester_client_id:
                print(f"Unauthorized edit attempt for flag {flag_id} by client {requester_client_id}")
                return
            
        flag.text_content = data.get('text_content', flag.text_content)
        flag.post_type = data.get('post_type', flag.post_type)
        
        # If new file is uploaded, update paths
        if 'file_path' in data:
            flag.file_path = data.get('file_path')
            flag.thumbnail_path = data.get('thumbnail_path')
            
        db.session.commit()
        
        flag_data = _serialize_flag(flag)
        
        emit('flag_edited', flag_data, to=session_id)

@socketio.on('delete_flag')
def on_delete_flag(data):
    session_id = data.get('session_id')
    flag_id = data.get('flag_id')
    
    try:
        flag = Flag.query.get(int(flag_id))
    except (TypeError, ValueError):
        flag = Flag.query.get(flag_id)

    if flag:
        # 브로드캐스트에는 DB의 실제 PK(정수)를 사용 — 클라이언트 DOM 매칭 불일치 방지
        canonical_id = flag.id
        # Permission check:
        # 1. If it's a notice or objective, ONLY admin can delete.
        # 2. Otherwise, admin OR the owner can delete.
        is_admin = session.get('admin_logged_in', False)
        requester_client_id = _current_participant_id() or data.get('client_id')

        is_special_type = flag.post_type in ['notice', 'objective']

        if is_special_type:
            if not is_admin:
                print(f"Unauthorized delete attempt for special type {flag.post_type} by client {requester_client_id}")
                return
        else:
            if not is_admin and flag.client_id != requester_client_id:
                print(f"Unauthorized delete attempt for flag {flag_id} by client {requester_client_id}")
                return

        db.session.delete(flag)
        db.session.commit()

        emit('flag_deleted', {'id': canonical_id, 'session_id': session_id}, to=session_id)
        
@socketio.on('draw_data')
def on_draw_data(data):
    session_id = data.get('session_id')
    # Broadcast drawing data to everyone else in the room
    emit('draw_data', data, to=session_id, include_self=False)

@socketio.on('clear_canvas')
def on_clear_canvas(data):
    session_id = data.get('session_id')
    # Authorization check for clearing canvas (admin only)
    if session.get('admin_logged_in'):
        emit('clear_canvas', {}, to=session_id)

# --- ClassQuiz Events ---

@socketio.on('add_quiz_question')
def on_add_quiz_question(data):
    if not session.get('admin_logged_in'): return
    
    session_id = data.get('session_id')
    new_q = QuizQuestion(
        session_id=session_id,
        index=data.get('index'),
        q_type=data.get('q_type'),
        question=data.get('question'),
        options=data.get('options'),
        correct_answer=data.get('correct_answer')
    )
    db.session.add(new_q)
    db.session.commit()
    
    broadcast_questions(session_id)

@socketio.on('bulk_add_questions')
def on_bulk_add_questions(data):
    if not session.get('admin_logged_in'): return
    session_id = data.get('session_id')
    new_questions = data.get('questions', [])
    
    for q in new_questions:
        new_q = QuizQuestion(
            session_id=session_id,
            index=q.get('index'),
            q_type=q.get('q_type'),
            question=q.get('question'),
            options=q.get('options'),
            correct_answer=q.get('correct_answer')
        )
        db.session.add(new_q)
    
    db.session.commit()
    broadcast_questions(session_id)

@socketio.on('edit_quiz_question')
def on_edit_quiz_question(data):
    if not session.get('admin_logged_in'): return
    session_id = data.get('session_id')
    q_id = data.get('question_id')
    
    q = QuizQuestion.query.get(q_id)
    if q:
        q.index = data.get('index', q.index)
        q.q_type = data.get('q_type', q.q_type)
        q.question = data.get('question', q.question)
        q.options = data.get('options', q.options)
        q.correct_answer = data.get('correct_answer', q.correct_answer)
        db.session.commit()
        broadcast_questions(session_id)

@socketio.on('delete_quiz_question')
def on_delete_quiz_question(data):
    if not session.get('admin_logged_in'): return
    session_id = data.get('session_id')
    q_id = data.get('question_id')
    
    q = QuizQuestion.query.get(q_id)
    if q:
        QuizResponse.query.filter_by(question_id=q.id).delete()
        db.session.delete(q)
        db.session.commit()
        broadcast_questions(session_id)

@socketio.on('submit_quiz_response')
def on_submit_quiz_response(data):
    session_id = data.get('session_id')
    q_id = data.get('question_id')
    # 소유자 식별은 서버 신뢰 값 사용
    client_id = _current_participant_id() or data.get('client_id')
    response_text = data.get('response')
    author_name = data.get('author_name', 'Participant')

    # 입력 검증: 문제/응답/식별자가 없으면 무시 (NOT NULL 위반 및 세션 오염 방지)
    q = QuizQuestion.query.get(q_id) if q_id is not None else None
    if not q or not client_id or response_text is None:
        return

    # Grading logic
    is_correct = False
    if q.session_id != session_id:
        return

    if q.q_type == 'long':
        is_correct = bool(response_text and response_text.strip())
    elif q.q_type == 'choice':
        is_correct = _choice_answer_values(q, response_text) == _choice_answer_values(q, q.correct_answer)
    elif q.q_type == 'short':
        if q.correct_answer:
            is_correct = (_normalize_answer(response_text) == _normalize_answer(q.correct_answer))

    try:
        # Check for existing response by this client for this question
        resp = QuizResponse.query.filter_by(
            session_id=session_id, question_id=q_id, client_id=client_id).first()
        if resp:
            resp.response = response_text
            resp.is_correct = is_correct
            resp.author_name = author_name
        else:
            resp = QuizResponse(
                session_id=session_id,
                question_id=q_id,
                client_id=client_id,
                author_name=author_name,
                response=response_text,
                is_correct=is_correct
            )
            db.session.add(resp)
        db.session.commit()
    except Exception as e:
        # 유니크 제약 경쟁 등으로 실패 시 롤백 후 기존 응답을 갱신 (세션 오염 방지)
        db.session.rollback()
        resp = QuizResponse.query.filter_by(
            session_id=session_id, question_id=q_id, client_id=client_id).first()
        if not resp:
            print(f"Failed to save quiz response: {e}")
            return
        resp.response = response_text
        resp.is_correct = is_correct
        resp.author_name = author_name
        db.session.commit()

    resp_data = {
        'id': resp.id,
        'question_id': resp.question_id,
        'client_id': resp.client_id,
        'author_name': resp.author_name,
        'response': resp.response,
        'is_correct': resp.is_correct
    }

    # 응답 원문은 관리자 전용 룸에만 전송 (다른 학생에게 노출 금지)
    emit('new_response', resp_data, to=_admin_room(session_id))
    # Notify the student specifically about their own response (for live grading)
    emit('my_response_update', resp_data, to=request.sid)

@socketio.on('get_admin_results')
def on_get_admin_results(data):
    if not session.get('admin_logged_in'): return
    session_id = data.get('session_id')
    
    questions = QuizQuestion.query.filter_by(session_id=session_id).all()
    responses = QuizResponse.query.filter_by(session_id=session_id).all()
    
    q_data = [{'id': q.id, 'index': q.index, 'q_type': q.q_type, 'question': q.question, 'correct_answer': q.correct_answer} for q in questions]
    r_data = [{'id': r.id, 'question_id': r.question_id, 'client_id': r.client_id, 'author_name': r.author_name, 'response': r.response, 'is_correct': r.is_correct} for r in responses]
    
    emit('admin_results_data', {
        'session_id': session_id,
        'questions': q_data,
        'responses': r_data
    }, to=request.sid)

def broadcast_questions(session_id):
    questions = QuizQuestion.query.filter_by(session_id=session_id).order_by(QuizQuestion.index).all()
    # 학생 룸에는 정답 제거 버전 전송
    student_data = [_serialize_question(q, include_answer=False) for q in questions]
    emit('quiz_update', student_data, to=session_id)
    # 변경을 일으킨 관리자에게는 정답 포함 버전을 별도 전송 (관리 화면 갱신용)
    if session.get('admin_logged_in'):
        admin_data = [_serialize_question(q, include_answer=True) for q in questions]
        emit('quiz_update', admin_data, to=request.sid)
