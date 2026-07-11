from . import db
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
from datetime import datetime

class Admin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    password_hash = db.Column(db.String(255), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class ClassGroup(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    class_type = db.Column(db.String(20), nullable=False, default='classmap') # 'classmap', 'classwrite', 'classdraw', or 'classquiz'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    sessions = db.relationship('Session', backref='class_group', lazy=True, cascade='all, delete-orphan')

class Session(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id = db.Column(db.String(36), db.ForeignKey('class_group.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    flags = db.relationship('Flag', backref='session', lazy=True, cascade='all, delete-orphan')
    quiz_questions = db.relationship('QuizQuestion', backref='session', lazy=True, cascade='all, delete-orphan')
    quiz_responses = db.relationship('QuizResponse', backref='session', lazy=True, cascade='all, delete-orphan')
    uploads = db.relationship('Upload', backref='session', lazy=True, cascade='all, delete-orphan')

    @property
    def is_open(self):
        """Whether participants may enter or write to this session."""
        return bool(
            self.is_active
            and self.class_group
            and self.class_group.is_active
        )

class Flag(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey('session.id'), nullable=False)
    client_id = db.Column(db.String(100), nullable=True)
    region_id = db.Column(db.String(50), nullable=False) # Retained for compatibility if needed
    x = db.Column(db.Float, nullable=True) # latitude
    y = db.Column(db.Float, nullable=True) # longitude
    text_content = db.Column(db.Text, nullable=True)
    file_path = db.Column(db.String(255), nullable=True) # Path to uploaded file
    thumbnail_path = db.Column(db.String(255), nullable=True) # Path to generated thumbnail
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    author_name = db.Column(db.String(100), nullable=False, default="Participant")
    post_type = db.Column(db.String(20), nullable=False, default='normal') # 'normal', 'notice', 'objective'


class Upload(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = db.Column(db.String(36), db.ForeignKey('session.id'), nullable=False)
    owner_id = db.Column(db.String(100), nullable=False)
    purpose = db.Column(db.String(20), nullable=False, default='flag')
    file_path = db.Column(db.String(255), nullable=False, unique=True)
    thumbnail_path = db.Column(db.String(255), nullable=True, unique=True)
    flag_id = db.Column(db.Integer, db.ForeignKey('flag.id'), nullable=True, unique=True)
    question_id = db.Column(
        db.Integer,
        db.ForeignKey('quiz_question.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

class QuizQuestion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey('session.id'), nullable=False)
    index = db.Column(db.Integer, nullable=False)
    q_type = db.Column(db.String(20), nullable=False) # 'choice', 'short', 'long'
    question = db.Column(db.Text, nullable=False)
    options = db.Column(db.Text, nullable=True) # For choices (separated by |)
    correct_answer = db.Column(db.Text, nullable=True) # The actual correct answer index or text
    answer = db.Column(db.Text, nullable=True) # Legacy field
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class QuizResponse(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), db.ForeignKey('session.id'), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('quiz_question.id'), nullable=False)
    client_id = db.Column(db.String(100), nullable=False)
    author_name = db.Column(db.String(100), nullable=False, default="Participant")
    response = db.Column(db.Text, nullable=False)
    is_correct = db.Column(db.Boolean, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 한 참여자는 한 문제에 응답 1건만 — 중복 응답(경쟁 조건) 방지
    __table_args__ = (
        db.UniqueConstraint('session_id', 'question_id', 'client_id',
                            name='uq_response_session_question_client'),
    )
