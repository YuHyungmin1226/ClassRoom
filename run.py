# eventlet.monkey_patch() must run before any other imports (socket, threading,
# flask, etc.) so the standard library becomes cooperative. Without this, blocking
# socket calls don't yield to the eventlet hub, so Ctrl+C / SIGINT can't interrupt
# the server promptly and shutdown hangs until open connections time out.
import eventlet
eventlet.monkey_patch()

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app import create_app, socketio
import socket

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

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('true', '1', 'yes')

    # Print the banner once. In debug mode the reloader spawns a child process
    # (WERKZEUG_RUN_MAIN == 'true'); only print there to avoid duplicating it.
    # In production mode (no reloader) WERKZEUG_RUN_MAIN is never set, so print directly.
    if not debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        local_ips = get_all_local_ips()
        print("="*60)
        print("Classroom Server is running!")
        print(f"Classroom Portal: http://localhost:5555")

        for i, ip in enumerate(local_ips):
            print(f"Network Access: http://{ip}:5555")

        print("   (Share the Network Access link with your students)")
        print("="*60)

    socketio.run(app, debug=debug, host='0.0.0.0', port=5555, use_reloader=debug)
