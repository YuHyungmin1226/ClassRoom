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

    # 접속 안내는 정확히 한 번만 출력한다.
    # - 비디버그(리로더 없음): 현재 프로세스에서 바로 출력
    # - 디버그(리로더 사용): 실제로 서버를 띄우는 자식 프로세스(WERKZEUG_RUN_MAIN)에서만 출력
    if not debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
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
