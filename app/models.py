from . import db
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
from datetime import datetime

class Admin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    password_hash = db.Column(db.String(128))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class ClassGroup(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    class_type = db.Column(db.String(20), nullable=False, default='classmap') # 'classmap', 'classwrite', or 'classdraw'
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


# --- ClassQuiz: 과목별 문제 풀(pool) 시스템 ---

class SubjectQuestion(db.Model):
    """과목별 사전 제작 문제 풀."""
    id = db.Column(db.Integer, primary_key=True)
    subject = db.Column(db.String(20), nullable=False, index=True)   # kor/eng/math/social/sci
    grade = db.Column(db.Integer, nullable=False, index=True)        # 1, 2, 3
    unit = db.Column(db.String(120), nullable=True)                  # 단원
    standard_code = db.Column(db.String(40), nullable=True)          # 성취기준 코드 (예: [9국01-01])
    difficulty = db.Column(db.Integer, nullable=False, default=2)    # 1(하)~3(상)
    q_type = db.Column(db.String(20), nullable=False, default='choice')  # 'choice', 'short'
    question = db.Column(db.Text, nullable=False)
    options = db.Column(db.Text, nullable=True)        # 객관식 보기 ('|' 구분)
    correct_answer = db.Column(db.Text, nullable=False)  # 객관식은 번호(예: "2"), 단답은 텍스트
    explanation = db.Column(db.Text, nullable=True)     # 해설
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class QuizAttempt(db.Model):
    """학생 1회 풀이(30문제 세트)."""
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(100), nullable=False, index=True)
    nickname = db.Column(db.String(100), nullable=True)
    subject = db.Column(db.String(20), nullable=False)
    grade = db.Column(db.Integer, nullable=False)
    question_ids = db.Column(db.Text, nullable=False)  # 출제된 문항 id 목록(JSON)
    total = db.Column(db.Integer, nullable=False, default=0)
    correct_count = db.Column(db.Integer, nullable=False, default=0)
    score = db.Column(db.Integer, nullable=False, default=0)  # 0~100
    is_perfect = db.Column(db.Boolean, nullable=False, default=False)
    point_awarded = db.Column(db.Boolean, nullable=False, default=False)
    is_retry = db.Column(db.Boolean, nullable=False, default=False)  # 오답 재풀이 여부
    completed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    answers = db.relationship('AttemptAnswer', backref='attempt', lazy=True, cascade='all, delete-orphan')


class AttemptAnswer(db.Model):
    """시도 내 문항별 답안/채점 결과."""
    id = db.Column(db.Integer, primary_key=True)
    attempt_id = db.Column(db.Integer, db.ForeignKey('quiz_attempt.id'), nullable=False, index=True)
    question_id = db.Column(db.Integer, db.ForeignKey('subject_question.id'), nullable=False)
    response = db.Column(db.Text, nullable=True)
    is_correct = db.Column(db.Boolean, nullable=False, default=False)


class StudentPoint(db.Model):
    """기기(client_id)별 누적 포인트."""
    client_id = db.Column(db.String(100), primary_key=True)
    nickname = db.Column(db.String(100), nullable=True)
    points = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
