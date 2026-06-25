import sys
import os
import signal
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app import create_app, socketio
import socket

def signal_handler(sig, frame):
    # Force exit instantly on Ctrl+C (SIGINT) to bypass eventlet's slow graceful shutdown
    print("\n[!] Stopping server immediately...", flush=True)
    os._exit(0)

# Register the SIGINT signal handler
signal.signal(signal.SIGINT, signal_handler)

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

app = create_app(auto_seed=True)

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('true', '1', 'yes')

    # Print connection guides always on startup
    local_ips = get_all_local_ips()
    print("=" * 60, flush=True)
    print("Classroom Server is running!", flush=True)
    print("Local:   http://localhost:5555", flush=True)
    for ip in local_ips:
        print(f"Network: http://{ip}:5555", flush=True)
    print("   (Share the Network link with students on the same Wi-Fi)", flush=True)
    print("   Press Ctrl+C to stop the server.", flush=True)
    print("=" * 60, flush=True)

    socketio.run(app, debug=debug, host='0.0.0.0', port=5555, use_reloader=debug)
