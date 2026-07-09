# Classroom Collaboration Platform

Classroom Portal is a real-time classroom collaboration platform for teachers and students on the same local network. It supports four activity modes:

- **ClassMap**: place pins, notes, media, and YouTube embeds on a shared map
- **ClassWrite**: collect structured posts, notices, and learning objectives in a live feed
- **ClassDraw**: draw together on a shared real-time canvas
- **ClassQuiz**: create quizzes, collect student answers, and view live results

## Key Features

- **Real-time collaboration** through Flask-SocketIO
- **Class and session management** for active and archived classroom activities
- **Media upload** for images, videos, documents, and HTML files
- **YouTube embedding** from pasted links
- **Quiz Excel import/export** for bulk question management
- **Markdown ZIP export** with post content and attached files
- **Local network access**: the server prints LAN URLs that students can open from devices on the same Wi-Fi

## Tech Stack

- **Backend**: Python, Flask, Flask-SocketIO
- **Database**: SQLAlchemy, SQLite
- **Frontend**: HTML, CSS, JavaScript
- **Realtime**: Socket.IO

## Quick Start

### Windows

Double-click `start_windows.bat`.

The launcher creates or reuses the bundled `python_portable` runtime, verifies required modules, installs missing dependencies, clears port `5555`, and starts the server.

### macOS / Linux

Run `start_mac.command` from a terminal.

### Manual Run

```bash
pip install -r requirements.txt
python run.py
```

Open `http://localhost:5555` on the host computer. Share one of the printed `http://<local-ip>:5555` network URLs with students on the same Wi-Fi.

## Admin Password

On first startup, the app creates an admin account. If `ADMIN_PASSWORD` is set in the environment, that value is used. Otherwise, a one-time random password is printed in the server console. Change it immediately from **Admin Settings** after logging in.

## Maintenance

For existing SQLite databases from older versions, stop the running server first, then run:

```bash
python migrate_db.py
```

The migration script backs up `instance/app.db` before applying schema updates.

## License

MIT License
