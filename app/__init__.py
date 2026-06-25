from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from .config import Config

db = SQLAlchemy()
socketio = SocketIO(cors_allowed_origins=Config.ALLOWED_ORIGINS or "*")

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    import os
    # Ensure instance and upload directories exist
    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    db.init_app(app)
    socketio.init_app(app)

    with app.app_context():
        from . import models
        db.create_all()
        
        # Initialize default admin if not exists
        admin = models.Admin.query.first()
        if not admin:
            default_admin = models.Admin()
            default_admin.set_password('admin123')
            db.session.add(default_admin)
            db.session.commit()

        from .seeding import seed_if_empty
        seed_if_empty()

        from .routes import main
        app.register_blueprint(main)
        from . import events

    return app
