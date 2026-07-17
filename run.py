import sys
import os
import signal
import warnings
import logging
import socket
import secrets

RESET_PASSWORD_FLAG = '--reset-admin-password'
reset_password_value = None
if RESET_PASSWORD_FLAG in sys.argv:
    reset_password_value = os.environ.get('ADMIN_PASSWORD') or secrets.token_urlsafe(12)
    os.environ['ADMIN_PASSWORD'] = reset_password_value

warnings.filterwarnings(
    "ignore",
    message=r"urllib3 .* or chardet .* doesn't match a supported version!",
)

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app import create_app, socketio  # noqa: E402

def get_all_local_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        primary_ip = s.getsockname()[0]
        ips.append(primary_ip)
        s.close()
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        all_ips = socket.gethostbyname_ex(hostname)[2]
        for ip in all_ips:
            if not ip.startswith('127.'):
                ips.append(ip)
    except Exception:
        pass
            
    if not ips:
        ips.append('127.0.0.1')
            
    return list(set(ips))

app = create_app()


def reset_admin_password(password):
    from app import db
    from app.models import Admin

    with app.app_context():
        admin = Admin.query.first()
        if not admin:
            admin = Admin(id=1)
            db.session.add(admin)
        admin.set_password(password)
        db.session.commit()

    print('=' * 60)
    print(f"[Security] New admin password: {password}")
    print('Log in and change it immediately from Admin Settings.')
    print('=' * 60)


if __name__ == '__main__':
    if reset_password_value:
        reset_admin_password(reset_password_value)
        raise SystemExit(0)

    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('true', '1', 'yes')

    # Print the banner once. In debug mode the reloader spawns a child process
    # (WERKZEUG_RUN_MAIN == 'true'); only print there to avoid duplicating it.
    # In production mode (no reloader) WERKZEUG_RUN_MAIN is never set, so print directly.
    if not debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        local_ips = get_all_local_ips()
        print("="*60)
        print("Classroom Server is running!")
        print("Classroom Portal: http://localhost:5555")

        for i, ip in enumerate(local_ips):
            print(f"Network Access: http://{ip}:5555")

        print("   (Share the Network Access link with your students)")
        print("   (Press Ctrl+C to stop the server)")
        print("="*60)

    if not debug:
        logging.getLogger('werkzeug').setLevel(logging.ERROR)
        try:
            import flask.cli
            flask.cli.show_server_banner = lambda *args, **kwargs: None
        except Exception:
            pass
        signal.signal(signal.SIGINT, signal.SIG_DFL)
        if hasattr(signal, 'SIGBREAK'):  # Ctrl+Break on Windows
            signal.signal(signal.SIGBREAK, signal.SIG_DFL)

    socketio.run(app, debug=debug, host='0.0.0.0', port=5555,
                 use_reloader=debug, allow_unsafe_werkzeug=True)
