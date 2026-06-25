import sys
import os
import signal
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app import create_app, socketio
import socket

def _shutdown(*_args):
    # eventlet의 느린 graceful shutdown을 건너뛰고 즉시 종료
    print("\n[!] Stopping server...", flush=True)
    os._exit(0)


if sys.platform == 'win32':
    # Windows: 파이썬 signal 핸들러는 '메인 스레드'에서만 실행되는데, 메인 스레드는
    # eventlet 허브의 블로킹 select에 갇혀 있어 Ctrl+C가 한참 뒤에야 처리된다.
    # 콘솔 컨트롤 핸들러는 OS가 만든 '별도 스레드'에서 실행되므로 메인 스레드와
    # 무관하게 즉시 종료할 수 있다.
    import ctypes

    def _win_ctrl_handler(ctrl_type):
        if ctrl_type in (0, 1, 2):  # CTRL_C / CTRL_BREAK / CTRL_CLOSE
            _shutdown()
        return True

    _WIN_HANDLER = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_uint)(_win_ctrl_handler)
    ctypes.windll.kernel32.SetConsoleCtrlHandler(_WIN_HANDLER, True)
else:
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

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
