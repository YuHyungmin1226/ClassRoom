import os
import math
import re
from flask_socketio import emit, join_room, leave_room, rooms
from sqlalchemy.exc import SQLAlchemyError
from . import socketio, db
from .models import Flag, QuizQuestion, QuizResponse, Session, Upload
from flask import current_app, request, session


POST_TYPES = frozenset({'normal', 'notice', 'objective'})
QUESTION_TYPES = frozenset({'choice', 'short', 'long'})
DRAW_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
QUESTION_UPLOAD_RE = re.compile(
    r'(?<![A-Za-z0-9_])/?(uploads/[A-Za-z0-9][A-Za-z0-9_.-]*)'
)


def _admin_room(session_id):
    """관리자 전용 하위 룸 이름 — 학생 응답을 학생끼리 보지 못하도록 분리"""
    return f"{session_id}:admins"


def _session_writable(session_id):
    """세션이 존재하고, 활성 상태이거나 요청자가 관리자인 경우에만 쓰기 허용.
    on_join과 동일한 기준 — 닫힌 세션에 대한 참여자의 add_flag/draw_data 등 우회 쓰기를 차단.
    """
    if not session_id:
        return False
    sess = db.session.get(Session, session_id)
    return bool(sess) and session_id in rooms() and (
        sess.is_open or session.get('admin_logged_in', False)
    )


def _quiz_session(session_id):
    sess = db.session.get(Session, session_id) if session_id else None
    if not sess or not sess.class_group or sess.class_group.class_type != 'classquiz':
        return None
    return sess


def _upload_owner_id():
    return _current_participant_id() or (
        'admin' if session.get('admin_logged_in') else None
    )


def _owned_flag_upload(file_path, session_id, current_flag_id=None):
    """Return a staged upload only when it belongs to this user and session."""
    if not file_path:
        return None

    filename = os.path.basename(str(file_path).replace('\\', '/'))
    canonical_path = f"uploads/{filename}"
    upload = Upload.query.filter_by(file_path=canonical_path).first()
    if (
        not upload
        or upload.session_id != session_id
        or upload.owner_id != _upload_owner_id()
        or upload.purpose != 'flag'
        or upload.flag_id not in (None, current_flag_id)
    ):
        return None

    upload_folder = current_app.config['UPLOAD_FOLDER']
    if not os.path.isfile(os.path.join(upload_folder, filename)):
        return None
    if upload.thumbnail_path:
        thumb_name = os.path.basename(upload.thumbnail_path)
        if not os.path.isfile(os.path.join(upload_folder, thumb_name)):
            upload.thumbnail_path = None
    return upload


def _delete_upload_file(rel_path):
    """업로드 폴더 내 파일을 안전하게 삭제 (routes.py의 delete_file_safe와 동일 로직)."""
    if not rel_path:
        return
    filename = os.path.basename(str(rel_path).replace('\\', '/'))
    abs_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
    try:
        if os.path.isfile(abs_path):
            os.remove(abs_path)
    except Exception as e:
        print(f"Failed to delete orphaned file {abs_path}: {e}")


def _delete_upload_files_if_unreferenced(paths):
    for rel_path in paths:
        if not rel_path:
            continue
        referenced = Upload.query.filter(
            (Upload.file_path == rel_path) | (Upload.thumbnail_path == rel_path)
        ).first() or Flag.query.filter(
            (Flag.file_path == rel_path) | (Flag.thumbnail_path == rel_path)
        ).first()
        if not referenced:
            _delete_upload_file(rel_path)


def _question_payload(data, current=None):
    try:
        index = int(data.get('index', current.index if current else None))
    except (TypeError, ValueError):
        return None

    q_type = str(data.get('q_type', current.q_type if current else '')).strip().lower()
    question = str(data.get('question', current.question if current else '')).strip()
    options = str(data.get('options', current.options if current else '') or '').strip()
    correct_answer = str(
        data.get('correct_answer', current.correct_answer if current else '') or ''
    ).strip()
    if q_type not in QUESTION_TYPES or not question or not 0 <= index <= 100000:
        return None
    if q_type == 'choice' and len([item for item in options.split('|') if item.strip()]) < 2:
        return None
    if q_type in {'choice', 'short'} and not correct_answer:
        return None
    return {
        'index': index,
        'q_type': q_type,
        'question': question,
        'options': options,
        'correct_answer': correct_answer,
    }


def _sync_quiz_uploads(question):
    referenced_paths = set(QUESTION_UPLOAD_RE.findall(question.question or ''))
    files_to_delete = set()

    for upload in Upload.query.filter_by(
        session_id=question.session_id,
        purpose='quiz',
        question_id=question.id,
    ).all():
        if upload.file_path not in referenced_paths:
            replacement = _other_question_using_upload(upload, question.id)
            if replacement:
                upload.question_id = replacement.id
            else:
                files_to_delete.update((upload.file_path, upload.thumbnail_path))
                db.session.delete(upload)

    for file_path in referenced_paths:
        upload = Upload.query.filter_by(
            session_id=question.session_id,
            purpose='quiz',
            file_path=file_path,
        ).first()
        if upload and upload.question_id in (None, question.id):
            upload.question_id = question.id

    return files_to_delete


def _other_question_using_upload(upload, excluded_question_id):
    candidates = QuizQuestion.query.filter(
        QuizQuestion.session_id == upload.session_id,
        QuizQuestion.id != excluded_question_id,
    ).all()
    for question in candidates:
        if upload.file_path in set(QUESTION_UPLOAD_RE.findall(question.question or '')):
            return question
    return None


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
    sess = db.session.get(Session, room)
    if not sess or (not sess.is_open and not is_admin):
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
        # 서명된 participant_id가 없는 소켓은 client_id를 신뢰하지 않는다 —
        # 브로드캐스트로 노출된 남의 client_id를 도용해 타인의 채점 결과를 열람할 수 있으므로 폴백하지 않는다.
        pid = _current_participant_id()
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
    room = data.get('session_id')
    if not room:
        return
    leave_room(room)
    if session.get('admin_logged_in'):
        leave_room(_admin_room(room))

@socketio.on('add_flag')
def on_add_flag(data):
    session_id = data.get('session_id')
    if not _session_writable(session_id):
        return
    target_session = db.session.get(Session, session_id)
    if target_session.class_group.class_type == 'classquiz':
        return

    region_id = str(data.get('region_id') or '').strip()
    if not region_id or len(region_id) > 50:
        return
    try:
        x = float(data['x']) if data.get('x') not in (None, '') else None
        y = float(data['y']) if data.get('y') not in (None, '') else None
    except (TypeError, ValueError):
        return
    if any(value is not None and not math.isfinite(value) for value in (x, y)):
        return

    text_content = data.get('text_content')
    if text_content is not None and not isinstance(text_content, str):
        return
    author_name = str(data.get('author_name') or 'Participant').strip()[:100] or 'Participant'
    is_admin = session.get('admin_logged_in', False)
    # 서명된 participant_id가 없는 소켓(참여자용 HTTP 세션 페이지를 거치지 않은 클라이언트)은
    # 클라이언트가 보낸 client_id를 신뢰할 수 없으므로 쓰기를 거부한다 — 그 값은 다른 참여자의
    # 실제 client_id를 도용해 위조할 수 있다 (브로드캐스트에 client_id가 그대로 노출되므로).
    if not is_admin and not _current_participant_id():
        return
    # 소유자 식별은 서버가 신뢰하는 participant_id 사용 (클라이언트 위조 방지).
    # 세션 값이 없을 때만(예외적, 관리자 한정) 클라이언트 값으로 폴백.
    client_id = _current_participant_id() or data.get('client_id')
    post_type = data.get('post_type', 'normal')
    if post_type not in POST_TYPES:
        post_type = 'normal'

    # Permission check: Only admin can create notice or objective
    if not is_admin and post_type in ['notice', 'objective']:
        post_type = 'normal'

    upload = None
    if data.get('file_path'):
        upload = _owned_flag_upload(data.get('file_path'), session_id)
        if not upload:
            return

    new_flag = Flag(
        session_id=session_id,
        region_id=region_id,
        x=x,
        y=y,
        text_content=text_content,
        file_path=upload.file_path if upload else None,
        thumbnail_path=upload.thumbnail_path if upload else None,
        author_name=author_name,
        client_id=client_id,
        post_type=post_type
    )
    db.session.add(new_flag)
    try:
        db.session.flush()
        if upload:
            upload.flag_id = new_flag.id
        db.session.commit()
    except SQLAlchemyError as error:
        db.session.rollback()
        print(f"Failed to create flag: {error}")
        return

    flag_data = _serialize_flag(new_flag)
    
    # Broadcast to everyone in the room (session)
    emit('new_flag', flag_data, to=session_id)

@socketio.on('edit_flag')
def on_edit_flag(data):
    session_id = data.get('session_id')
    if not _session_writable(session_id):
        return
    flag_id = data.get('flag_id')

    flag = db.session.get(Flag, flag_id)
    if flag and flag.session_id == session_id:
        # Authorization check: Admin or the person who created the flag
        is_admin = session.get('admin_logged_in', False)
        # 서명된 participant_id가 없는 소켓은 client_id를 신뢰하지 않는다 —
        # 그렇지 않으면 브로드캐스트로 노출된 남의 client_id를 도용해 소유권 검증을 통과할 수 있다.
        if not is_admin and not _current_participant_id():
            return
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
        requested_post_type = data.get('post_type', flag.post_type)
        if is_admin and requested_post_type in POST_TYPES:
            flag.post_type = requested_post_type
        
        files_to_delete = set()
        old_upload_to_delete = None
        new_upload_to_claim = None
        # If a new file is uploaded, claim it before releasing the previous one.
        if 'file_path' in data:
            new_upload = None
            if data.get('file_path'):
                new_upload = _owned_flag_upload(
                    data.get('file_path'), session_id, current_flag_id=flag.id
                )
                if not new_upload:
                    return
            old_upload = Upload.query.filter_by(flag_id=flag.id).first()
            old_paths = {flag.file_path, flag.thumbnail_path}
            flag.file_path = new_upload.file_path if new_upload else None
            flag.thumbnail_path = new_upload.thumbnail_path if new_upload else None
            if old_upload and old_upload.id != (new_upload.id if new_upload else None):
                old_upload_to_delete = old_upload
            new_upload_to_claim = new_upload
            files_to_delete = old_paths - {flag.file_path, flag.thumbnail_path}

        try:
            if old_upload_to_delete:
                old_upload_to_delete.flag_id = None
                db.session.flush()
            if new_upload_to_claim:
                new_upload_to_claim.flag_id = flag.id
            if old_upload_to_delete:
                db.session.delete(old_upload_to_delete)
            db.session.commit()
        except SQLAlchemyError as error:
            db.session.rollback()
            print(f"Failed to edit flag: {error}")
            return
        _delete_upload_files_if_unreferenced(files_to_delete)
        
        flag_data = _serialize_flag(flag)
        
        emit('flag_edited', flag_data, to=session_id)

@socketio.on('delete_flag')
def on_delete_flag(data):
    session_id = data.get('session_id')
    if not _session_writable(session_id):
        return
    flag_id = data.get('flag_id')

    try:
        flag = db.session.get(Flag, int(flag_id))
    except (TypeError, ValueError):
        flag = db.session.get(Flag, flag_id)

    if flag and flag.session_id == session_id:
        # 브로드캐스트에는 DB의 실제 PK(정수)를 사용 — 클라이언트 DOM 매칭 불일치 방지
        canonical_id = flag.id
        # Permission check:
        # 1. If it's a notice or objective, ONLY admin can delete.
        # 2. Otherwise, admin OR the owner can delete.
        is_admin = session.get('admin_logged_in', False)
        # 서명된 participant_id가 없는 소켓은 client_id를 신뢰하지 않는다 (도용 방지).
        if not is_admin and not _current_participant_id():
            return
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

        upload = Upload.query.filter_by(flag_id=flag.id).first()
        files_to_delete = {flag.file_path, flag.thumbnail_path}
        try:
            if upload:
                upload.flag_id = None
                db.session.flush()
                db.session.delete(upload)
                db.session.flush()
            db.session.delete(flag)
            db.session.commit()
        except SQLAlchemyError as error:
            db.session.rollback()
            print(f"Failed to delete flag: {error}")
            return
        _delete_upload_files_if_unreferenced(files_to_delete)

        emit('flag_deleted', {'id': canonical_id, 'session_id': session_id}, to=session_id)
        
@socketio.on('draw_data')
def on_draw_data(data):
    session_id = data.get('session_id')
    if not _session_writable(session_id):
        return
    draw_session = db.session.get(Session, session_id)
    if draw_session.class_group.class_type != 'classdraw':
        return
    if not session.get('admin_logged_in') and not _current_participant_id():
        return

    try:
        coordinates = [float(data[key]) for key in ('x', 'y', 'prevX', 'prevY')]
        size = float(data.get('size'))
    except (KeyError, TypeError, ValueError):
        return
    color = str(data.get('color', ''))
    if (
        not all(math.isfinite(value) and 0 <= value <= 1 for value in coordinates)
        or not math.isfinite(size)
        or not 1 <= size <= 40
        or not DRAW_COLOR_RE.fullmatch(color)
    ):
        return

    payload = {
        'session_id': session_id,
        'x': coordinates[0],
        'y': coordinates[1],
        'prevX': coordinates[2],
        'prevY': coordinates[3],
        'color': color,
        'size': size,
    }
    # Broadcast drawing data to everyone else in the room
    emit('draw_data', payload, to=session_id, include_self=False)

@socketio.on('clear_canvas')
def on_clear_canvas(data):
    session_id = data.get('session_id')
    # Authorization check for clearing canvas (admin only)
    draw_session = db.session.get(Session, session_id) if session_id else None
    if (
        session.get('admin_logged_in')
        and _session_writable(session_id)
        and draw_session.class_group.class_type == 'classdraw'
    ):
        emit('clear_canvas', {}, to=session_id)

# --- ClassQuiz Events ---

@socketio.on('add_quiz_question')
def on_add_quiz_question(data):
    if not session.get('admin_logged_in'):
        return
    
    session_id = data.get('session_id')
    if not _quiz_session(session_id):
        return
    values = _question_payload(data)
    if not values:
        return
    new_q = QuizQuestion(session_id=session_id, **values)
    db.session.add(new_q)
    try:
        db.session.flush()
        files_to_delete = _sync_quiz_uploads(new_q)
        db.session.commit()
    except SQLAlchemyError as error:
        db.session.rollback()
        print(f"Failed to add quiz question: {error}")
        return
    _delete_upload_files_if_unreferenced(files_to_delete)
    
    broadcast_questions(session_id)

@socketio.on('bulk_add_questions')
def on_bulk_add_questions(data):
    if not session.get('admin_logged_in'):
        return
    session_id = data.get('session_id')
    if not _quiz_session(session_id):
        return
    new_questions = data.get('questions', [])
    if not isinstance(new_questions, list) or not new_questions:
        return
    values_list = [_question_payload(question) for question in new_questions]
    if any(values is None for values in values_list):
        return
    files_to_delete = set()
    try:
        for values in values_list:
            question = QuizQuestion(session_id=session_id, **values)
            db.session.add(question)
            db.session.flush()
            files_to_delete.update(_sync_quiz_uploads(question))
        db.session.commit()
    except SQLAlchemyError as error:
        db.session.rollback()
        print(f"Failed to add quiz questions: {error}")
        return
    _delete_upload_files_if_unreferenced(files_to_delete)
    broadcast_questions(session_id)

@socketio.on('edit_quiz_question')
def on_edit_quiz_question(data):
    if not session.get('admin_logged_in'):
        return
    session_id = data.get('session_id')
    if not _quiz_session(session_id):
        return
    q_id = data.get('question_id')
    
    q = db.session.get(QuizQuestion, q_id)
    if q and q.session_id == session_id:
        values = _question_payload(data, current=q)
        if not values:
            return
        for field, value in values.items():
            setattr(q, field, value)
        files_to_delete = _sync_quiz_uploads(q)
        try:
            db.session.commit()
        except SQLAlchemyError as error:
            db.session.rollback()
            print(f"Failed to edit quiz question: {error}")
            return
        _delete_upload_files_if_unreferenced(files_to_delete)
        broadcast_questions(session_id)

@socketio.on('delete_quiz_question')
def on_delete_quiz_question(data):
    if not session.get('admin_logged_in'):
        return
    session_id = data.get('session_id')
    if not _quiz_session(session_id):
        return
    q_id = data.get('question_id')
    
    q = db.session.get(QuizQuestion, q_id)
    if q and q.session_id == session_id:
        uploads = Upload.query.filter_by(question_id=q.id, purpose='quiz').all()
        uploads_to_delete = []
        files_to_delete = set()
        try:
            for upload in uploads:
                replacement = _other_question_using_upload(upload, q.id)
                if replacement:
                    upload.question_id = replacement.id
                else:
                    upload.question_id = None
                    uploads_to_delete.append(upload)
                    files_to_delete.update((upload.file_path, upload.thumbnail_path))
            if uploads:
                db.session.flush()
            for upload in uploads_to_delete:
                db.session.delete(upload)
            if uploads_to_delete:
                db.session.flush()
            QuizResponse.query.filter_by(question_id=q.id).delete()
            db.session.delete(q)
            db.session.commit()
        except SQLAlchemyError as error:
            db.session.rollback()
            print(f"Failed to delete quiz question: {error}")
            return
        _delete_upload_files_if_unreferenced(files_to_delete)
        broadcast_questions(session_id)

@socketio.on('submit_quiz_response')
def on_submit_quiz_response(data):
    session_id = data.get('session_id')
    if not _session_writable(session_id):
        return
    q_id = data.get('question_id')
    # 서명된 participant_id가 없는 소켓은 거부 — 없으면 남의 client_id를 도용해
    # 이미 채점된 응답을 덮어쓸 수 있다 (아래 upsert가 client_id로만 소유자를 구분하므로).
    if not _current_participant_id():
        return
    # 소유자 식별은 서버 신뢰 값 사용
    client_id = _current_participant_id()
    response_text = data.get('response')
    author_name = str(data.get('author_name') or 'Participant').strip()[:100] or 'Participant'

    # 입력 검증: 문제/응답/식별자가 없으면 무시 (NOT NULL 위반 및 세션 오염 방지)
    q = db.session.get(QuizQuestion, q_id) if q_id is not None else None
    if not q or not client_id or not isinstance(response_text, str):
        return
    response_text = response_text[:10000]

    # Grading logic
    is_correct = False
    if q.session_id != session_id:
        return

    if q.q_type == 'long':
        is_correct = bool(response_text and response_text.strip())
    elif q.q_type == 'choice':
        # correct_answer가 비어있으면(문제 설정 미비) 무조건 오답 처리 —
        # 가드가 없으면 양쪽 다 빈 리스트로 평가되어 아무 응답이나 정답으로 채점된다.
        if q.correct_answer:
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
        try:
            db.session.commit()
        except Exception as e2:
            # 재시도 commit마저 실패하면(지속적인 쓰기 경합 등) 예외가 소켓 핸들러 밖으로
            # 전파되지 않도록 롤백 후 조용히 반환한다.
            db.session.rollback()
            print(f"Failed to save quiz response (retry): {e2}")
            return

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
    if not session.get('admin_logged_in'):
        return
    session_id = data.get('session_id')
    if not _quiz_session(session_id):
        return
    
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
    # 정답 포함 버전은 관리자 룸 전체에 별도 전송 (관리 화면 갱신용) —
    # to=request.sid로 보내면 변경을 일으킨 관리자만 갱신되고 다른 관리자 탭은 정답이 '-'로 남는다.
    admin_data = [_serialize_question(q, include_answer=True) for q in questions]
    emit('quiz_update', admin_data, to=_admin_room(session_id))
