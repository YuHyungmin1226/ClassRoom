from flask_socketio import emit, join_room, leave_room
from . import socketio, db
from .models import Flag
from flask import request, session


@socketio.on('join')
def on_join(data):
    room = data['session_id']
    join_room(room)
    # Send existing flags to the user who just joined
    flags = Flag.query.filter_by(session_id=room).all()
    flags_data = [{
        'id': f.id,
        'region_id': f.region_id,
        'x': f.x,
        'y': f.y,
        'text_content': f.text_content,
        'file_path': f.file_path,
        'thumbnail_path': f.thumbnail_path,
        'author_name': f.author_name,
        'client_id': f.client_id,
        'post_type': f.post_type
    } for f in flags]
    emit('load_flags', flags_data, to=request.sid)


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
    client_id = data.get('client_id')
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

    flag_data = {
        'id': new_flag.id,
        'region_id': new_flag.region_id,
        'x': new_flag.x,
        'y': new_flag.y,
        'text_content': new_flag.text_content,
        'file_path': new_flag.file_path,
        'thumbnail_path': new_flag.thumbnail_path,
        'author_name': new_flag.author_name,
        'client_id': new_flag.client_id,
        'post_type': new_flag.post_type
    }

    # Broadcast to everyone in the room (session)
    emit('new_flag', flag_data, to=session_id)


@socketio.on('edit_flag')
def on_edit_flag(data):
    session_id = data.get('session_id')
    flag_id = data.get('flag_id')

    flag = db.session.get(Flag, flag_id)
    if flag:
        # Authorization check: Admin or the person who created the flag
        is_admin = session.get('admin_logged_in', False)
        requester_client_id = data.get('client_id')

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

        flag_data = {
            'id': flag.id,
            'region_id': flag.region_id,
            'x': flag.x,
            'y': flag.y,
            'text_content': flag.text_content,
            'file_path': flag.file_path,
            'thumbnail_path': flag.thumbnail_path,
            'author_name': flag.author_name,
            'client_id': flag.client_id,
            'post_type': flag.post_type
        }

        emit('flag_edited', flag_data, to=session_id)


@socketio.on('delete_flag')
def on_delete_flag(data):
    session_id = data.get('session_id')
    flag_id = data.get('flag_id')

    try:
        flag = db.session.get(Flag, int(flag_id))
    except (TypeError, ValueError):
        flag = db.session.get(Flag, flag_id)

    if flag:
        # Permission check:
        # 1. If it's a notice or objective, ONLY admin can delete.
        # 2. Otherwise, admin OR the owner can delete.
        is_admin = session.get('admin_logged_in', False)
        requester_client_id = data.get('client_id')

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

        emit('flag_deleted', {'id': flag_id, 'session_id': session_id}, to=session_id)


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
