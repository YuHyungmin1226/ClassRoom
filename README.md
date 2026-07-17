# Classroom Collaboration Platform

Classroom Portal is a real-time classroom collaboration platform for teachers and students on the same local network. It supports five activity modes:

- **ClassMap**: place pins, notes, media, and YouTube embeds on a shared map
- **ClassWrite**: collect structured posts, notices, and learning objectives in a live feed
- **ClassDraw**: draw together on a shared real-time canvas
- **ClassQuiz**: create quizzes, collect student answers, and view live results
- **ClassGame**: launch classroom games in a full-screen browser view, starting with the `dialike` web RPG

## Key Features

- **Real-time collaboration** through Flask-SocketIO
- **Class and session management** for active and archived classroom activities
- **Media upload** for images, videos, and documents
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

The launcher downloads or reuses a local `python_portable` runtime, verifies required modules, installs missing dependencies, checks that port `5555` is available, and starts the server. It never terminates another process using that port.

### macOS / Linux

Run `start_mac.command` from a terminal.

### Manual Run

```bash
pip install -r requirements.txt
python run.py
```

Open `http://localhost:5555` on the host computer. Share one of the printed `http://<local-ip>:5555` network URLs with students on the same Wi-Fi.

## ClassGame Setup

ClassGame looks for DIALIKE in the `dialike` folder next to the `ClassRoom` repository. The default workspace layout is:

```text
CodeSpace/
|-- ClassRoom/
`-- dialike/
```

Set `CLASSGAME_DIALIKE_PATH` to an absolute folder path before startup to use a different location. Only registered runtime files (`index.html`, `style.css`, JavaScript, and image assets) are served; repository metadata, tests, and documentation remain private.

DIALIKE currently targets keyboard and mouse input. Starting a game requests browser fullscreen from the user's click. If the browser denies fullscreen, the game still fills the current browser viewport.

## Admin Password

On first startup, the app creates an admin account. If `ADMIN_PASSWORD` is set in the environment, that value is used. Otherwise, a one-time random password is printed in the server console. Change it immediately from **Admin Settings** after logging in.

If the password is lost, stop the server and run `python run.py --reset-admin-password`. The command resets the administrator password to `ADMIN_PASSWORD` when that environment variable is set, or generates and prints a new random password otherwise. It exits without starting the web server.

## Maintenance

For existing SQLite databases from older versions, stop the running server first, then run:

```bash
python migrate_db.py
```

The migration script backs up `instance/app.db` before applying schema updates.

Uploaded attachments are stored privately under `instance/uploads` and are served only through the access-controlled `/uploads/<filename>` route. On the first startup after upgrading, files from the legacy `app/static/uploads` folder are moved automatically. Name collisions or unsupported entries are retained outside the static tree under `instance/upload-quarantine` for manual review.

Deployments that keep runtime data elsewhere can set `CLASSROOM_UPLOAD_FOLDER` and `CLASSROOM_LEGACY_UPLOAD_FOLDER` to absolute paths before startup. The legacy folder must remain separate from the active upload folder.

## Tests

Run the backend, Socket.IO, ClassGame, and migration regression suite with:

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

## License

MIT License
