import base64
import io
import os
import tempfile
import unittest

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import create_app, db, socketio
from app.models import (
    Admin,
    ClassGroup,
    Flag,
    QuizQuestion,
    Session,
    Upload,
)


class ClassroomAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.app = create_app({
            'TESTING': True,
            'WTF_CSRF_ENABLED': False,
            'SECRET_KEY': 'test-secret',
            'ADMIN_PASSWORD': 'test-password',
            'SQLALCHEMY_DATABASE_URI': 'sqlite://',
            'UPLOAD_FOLDER': os.path.join(cls.temp_dir.name, 'uploads'),
            'ALLOWED_ORIGINS': None,
        })

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            db.session.remove()
            db.drop_all()
        cls.temp_dir.cleanup()

    def setUp(self):
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            admin = Admin(id=1)
            admin.set_password('test-password')
            db.session.add(admin)
            db.session.commit()
        self.client = self.app.test_client()

    def make_session(self, class_type='classwrite', class_active=True, session_active=True):
        with self.app.app_context():
            class_group = ClassGroup(
                name='Test class',
                class_type=class_type,
                is_active=class_active,
            )
            db.session.add(class_group)
            db.session.flush()
            classroom_session = Session(
                name='Test session',
                class_id=class_group.id,
                is_active=session_active,
            )
            db.session.add(classroom_session)
            db.session.commit()
            return class_group.id, classroom_session.id

    def set_participant(self, client, participant_id='participant-1'):
        with client.session_transaction() as flask_session:
            flask_session['participant_id'] = participant_id

    def set_admin(self, client):
        with client.session_transaction() as flask_session:
            flask_session['admin_logged_in'] = True

    def test_game_route_exposes_only_registered_runtime_assets(self):
        def status(path):
            response = self.client.get(path)
            try:
                return response.status_code
            finally:
                response.close()

        self.assertEqual(status('/classgame/dialike/files/'), 200)
        self.assertEqual(status('/classgame/dialike/files/js/game.js'), 200)
        self.assertEqual(status('/classgame/dialike/files/assets/tile_stone.png'), 200)
        self.assertEqual(status('/classgame/dialike/files/.git/config'), 404)
        self.assertEqual(status('/classgame/dialike/files/README.md'), 404)

    def test_menu_and_game_player_keep_accessibility_and_sandbox_contracts(self):
        home = self.client.get('/')
        self.assertEqual(home.status_code, 200)
        home_html = home.get_data(as_text=True)
        self.assertEqual(home_html.count('class="selection-card"'), 5)
        self.assertNotIn('onclick="goToDashboard', home_html)
        self.assertIn('href="/classgame"', home_html)

        classgame = self.client.get('/classgame')
        self.assertEqual(classgame.status_code, 200)
        classgame_html = classgame.get_data(as_text=True)
        self.assertIn('sandbox="allow-scripts allow-pointer-lock"', classgame_html)
        self.assertIn('role="dialog"', classgame_html)
        self.assertIn('/assets/tile_stone.png', classgame_html)

    def test_login_with_missing_password_returns_form_instead_of_error(self):
        response = self.client.post('/admin/login', data={})
        self.assertEqual(response.status_code, 200)

    def test_closed_parent_class_blocks_active_child_session(self):
        _class_id, session_id = self.make_session(class_active=False)
        response = self.client.get(f'/session/{session_id}')
        self.assertEqual(response.status_code, 403)

    def test_admin_cannot_create_session_in_closed_class(self):
        class_id, _session_id = self.make_session(class_active=False)
        self.set_admin(self.client)
        response = self.client.post(
            f'/admin/class/{class_id}/create_session',
            data={'name': 'Should not exist'},
        )
        self.assertEqual(response.status_code, 409)

    def test_participant_cannot_promote_post_to_notice(self):
        _class_id, session_id = self.make_session()
        with self.app.app_context():
            flag = Flag(
                session_id=session_id,
                client_id='participant-1',
                region_id='feed',
                text_content='Original',
                author_name='Student',
                post_type='normal',
            )
            db.session.add(flag)
            db.session.commit()
            flag_id = flag.id

        self.set_participant(self.client)
        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        socket_client.emit('join', {'session_id': session_id})
        socket_client.emit('edit_flag', {
            'session_id': session_id,
            'flag_id': flag_id,
            'text_content': 'Edited',
            'post_type': 'notice',
        })
        socket_client.disconnect()

        with self.app.app_context():
            updated = db.session.get(Flag, flag_id)
            self.assertEqual(updated.text_content, 'Edited')
            self.assertEqual(updated.post_type, 'normal')

    def test_malformed_flag_event_is_ignored_without_poisoning_session(self):
        _class_id, session_id = self.make_session()
        self.set_participant(self.client)
        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        socket_client.emit('join', {'session_id': session_id})
        socket_client.emit('add_flag', {
            'session_id': session_id,
            'text_content': 'Missing region',
        })
        socket_client.disconnect()

        with self.app.app_context():
            self.assertEqual(Flag.query.count(), 0)
            self.assertTrue(db.session.execute(text('SELECT 1')).scalar())

    def test_socket_must_join_session_room_before_writing(self):
        _class_id, session_id = self.make_session()
        self.set_participant(self.client)
        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        payload = {
            'session_id': session_id,
            'region_id': 'feed',
            'text_content': 'Room-scoped post',
        }
        socket_client.emit('add_flag', payload)
        with self.app.app_context():
            self.assertEqual(Flag.query.count(), 0)

        socket_client.emit('join', {'session_id': session_id})
        socket_client.emit('add_flag', payload)
        socket_client.disconnect()
        with self.app.app_context():
            self.assertEqual(Flag.query.count(), 1)

    def test_upload_can_only_be_claimed_by_its_owner_and_is_deleted_with_flag(self):
        _class_id, session_id = self.make_session()
        self.set_participant(self.client, 'owner')
        response = self.client.post(
            '/upload',
            data={
                'session_id': session_id,
                'purpose': 'flag',
                'file': (io.BytesIO(b'classroom attachment'), 'notes.txt'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(response.status_code, 200)
        file_path = response.get_json()['file_path']
        absolute_path = os.path.join(
            self.app.config['UPLOAD_FOLDER'],
            os.path.basename(file_path),
        )
        self.assertTrue(os.path.isfile(absolute_path))

        other_client = self.app.test_client()
        self.set_participant(other_client, 'other')
        other_socket = socketio.test_client(self.app, flask_test_client=other_client)
        other_socket.emit('join', {'session_id': session_id})
        other_socket.emit('add_flag', {
            'session_id': session_id,
            'region_id': 'feed',
            'text_content': 'Stolen attachment',
            'file_path': file_path,
        })
        other_socket.disconnect()
        with self.app.app_context():
            self.assertEqual(Flag.query.count(), 0)

        owner_socket = socketio.test_client(self.app, flask_test_client=self.client)
        owner_socket.emit('join', {'session_id': session_id})
        owner_socket.emit('add_flag', {
            'session_id': session_id,
            'region_id': 'feed',
            'text_content': 'Owned attachment',
            'file_path': file_path,
        })
        with self.app.app_context():
            flag = Flag.query.one()
            flag_id = flag.id
            upload = Upload.query.one()
            self.assertEqual(upload.flag_id, flag_id)

        owner_socket.emit('delete_flag', {
            'session_id': session_id,
            'flag_id': flag_id,
        })
        owner_socket.disconnect()
        with self.app.app_context():
            self.assertEqual(Flag.query.count(), 0)
            self.assertEqual(Upload.query.count(), 0)
        self.assertFalse(os.path.exists(absolute_path))

    def test_quiz_events_reject_invalid_and_cross_session_questions(self):
        _class_id, first_session_id = self.make_session(class_type='classquiz')
        _class_id, second_session_id = self.make_session(class_type='classquiz')
        with self.app.app_context():
            question = QuizQuestion(
                session_id=first_session_id,
                index=1,
                q_type='short',
                question='Original?',
                correct_answer='yes',
            )
            db.session.add(question)
            db.session.commit()
            question_id = question.id

        self.set_admin(self.client)
        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        socket_client.emit('join', {'session_id': first_session_id})
        socket_client.emit('join', {'session_id': second_session_id})
        socket_client.emit('add_quiz_question', {
            'session_id': first_session_id,
            'index': 2,
            'q_type': 'bogus',
            'question': 'Invalid',
        })
        socket_client.emit('edit_quiz_question', {
            'session_id': second_session_id,
            'question_id': question_id,
            'question': 'Cross-session edit',
        })
        socket_client.disconnect()

        with self.app.app_context():
            self.assertEqual(QuizQuestion.query.count(), 1)
            self.assertEqual(db.session.get(QuizQuestion, question_id).question, 'Original?')

    def test_quiz_image_upload_is_linked_and_removed_with_question_content(self):
        _class_id, session_id = self.make_session(class_type='classquiz')
        self.set_admin(self.client)
        png = base64.b64decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
            'AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        )
        response = self.client.post(
            '/upload',
            data={
                'session_id': session_id,
                'purpose': 'quiz',
                'file': (io.BytesIO(png), 'question.png'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(response.status_code, 200)
        file_path = response.get_json()['file_path']
        absolute_path = os.path.join(
            self.app.config['UPLOAD_FOLDER'],
            os.path.basename(file_path),
        )

        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        socket_client.emit('join', {'session_id': session_id})
        socket_client.emit('add_quiz_question', {
            'session_id': session_id,
            'index': 1,
            'q_type': 'long',
            'question': f'Explain this image.\n![image](/{file_path})',
        })
        with self.app.app_context():
            question = QuizQuestion.query.one()
            question_id = question.id
            self.assertEqual(Upload.query.one().question_id, question_id)
        self.assertTrue(os.path.isfile(absolute_path))

        socket_client.emit('edit_quiz_question', {
            'session_id': session_id,
            'question_id': question_id,
            'question': 'Explain the concept without an image.',
        })
        socket_client.disconnect()
        with self.app.app_context():
            self.assertEqual(Upload.query.count(), 0)
        self.assertFalse(os.path.exists(absolute_path))

    def test_shared_quiz_image_survives_until_last_question_is_deleted(self):
        _class_id, session_id = self.make_session(class_type='classquiz')
        self.set_admin(self.client)
        png = base64.b64decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
            'AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        )
        response = self.client.post(
            '/upload',
            data={
                'session_id': session_id,
                'purpose': 'quiz',
                'file': (io.BytesIO(png), 'shared.png'),
            },
            content_type='multipart/form-data',
        )
        file_path = response.get_json()['file_path']
        absolute_path = os.path.join(
            self.app.config['UPLOAD_FOLDER'],
            os.path.basename(file_path),
        )
        markdown = f'![shared image](/{file_path})'

        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        socket_client.emit('join', {'session_id': session_id})
        for index in (1, 2):
            socket_client.emit('add_quiz_question', {
                'session_id': session_id,
                'index': index,
                'q_type': 'long',
                'question': f'Question {index}\n{markdown}',
            })

        with self.app.app_context():
            questions = QuizQuestion.query.order_by(QuizQuestion.index).all()
            first_id, second_id = questions[0].id, questions[1].id
            self.assertEqual(Upload.query.one().question_id, first_id)

        socket_client.emit('delete_quiz_question', {
            'session_id': session_id,
            'question_id': first_id,
        })
        with self.app.app_context():
            self.assertEqual(Upload.query.one().question_id, second_id)
        self.assertTrue(os.path.isfile(absolute_path))

        socket_client.emit('delete_quiz_question', {
            'session_id': session_id,
            'question_id': second_id,
        })
        socket_client.disconnect()
        with self.app.app_context():
            self.assertEqual(Upload.query.count(), 0)
        self.assertFalse(os.path.exists(absolute_path))

    def test_quiz_upload_rejects_mislabeled_image_bytes(self):
        _class_id, session_id = self.make_session(class_type='classquiz')
        self.set_admin(self.client)
        before = set(os.listdir(self.app.config['UPLOAD_FOLDER']))
        response = self.client.post(
            '/upload',
            data={
                'session_id': session_id,
                'purpose': 'quiz',
                'file': (io.BytesIO(b'not an image'), 'fake.png'),
            },
            content_type='multipart/form-data',
        )
        self.assertEqual(response.status_code, 400)
        with self.app.app_context():
            self.assertEqual(Upload.query.count(), 0)
        self.assertEqual(set(os.listdir(self.app.config['UPLOAD_FOLDER'])), before)

    def test_session_delete_commits_before_removing_owned_files(self):
        _class_id, session_id = self.make_session()
        file_path = 'uploads/delete-me.txt'
        absolute_path = os.path.join(self.app.config['UPLOAD_FOLDER'], 'delete-me.txt')
        os.makedirs(self.app.config['UPLOAD_FOLDER'], exist_ok=True)
        with open(absolute_path, 'wb') as attachment:
            attachment.write(b'delete after commit')

        with self.app.app_context():
            flag = Flag(
                session_id=session_id,
                client_id='owner',
                region_id='feed',
                file_path=file_path,
                author_name='Owner',
            )
            db.session.add(flag)
            db.session.flush()
            db.session.add(Upload(
                session_id=session_id,
                owner_id='owner',
                purpose='flag',
                file_path=file_path,
                flag_id=flag.id,
            ))
            db.session.commit()

        self.set_admin(self.client)
        response = self.client.post(f'/admin/delete_session/{session_id}')
        self.assertEqual(response.status_code, 302)
        with self.app.app_context():
            self.assertEqual(Session.query.count(), 0)
            self.assertEqual(Flag.query.count(), 0)
            self.assertEqual(Upload.query.count(), 0)
        self.assertFalse(os.path.exists(absolute_path))

    def test_sqlite_foreign_keys_are_enabled(self):
        with self.app.app_context():
            enabled = db.session.execute(text('PRAGMA foreign_keys')).scalar()
            self.assertEqual(enabled, 1)
            db.session.add(QuizQuestion(
                session_id='missing-session',
                index=1,
                q_type='short',
                question='Orphan?',
                correct_answer='no',
            ))
            with self.assertRaises(IntegrityError):
                db.session.commit()
            db.session.rollback()

    def test_socketio_defaults_to_same_origin(self):
        self.assertIsNone(socketio.server.eio.cors_allowed_origins)


if __name__ == '__main__':
    unittest.main()
