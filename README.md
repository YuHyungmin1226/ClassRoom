# ClassMap & ClassWrite (Classroom Collaboration Platform)

Classroom Portal is a real-time, interactive collaboration platform designed for classroom sessions. It provides two distinct modes to suit different activities:
- **ClassMap**: A map-based activity where participants drop pins and notes on a shared map.
- **ClassWrite**: A board-based activity where participants share thoughts in a structured post-list format.

## Features
- **Real-time Collaboration**: Synchronize pins, notes, and posts across all clients instantly using Socket.IO.
- **Dual Activity Modes**: Choose between a Map view for spatial activities or a Board view for discussions and sharing.
- **Media Uploads**: Attach images and videos to your contributions with inline preview and playback.
- **YouTube Integration**: Paste a YouTube URL to automatically embed the video player in your note or post.
- **Hierarchy Management**: Administrators can manage multiple Classes and Sessions, including closing (archiving) them for review, or permanently deleting them along with their posts and uploaded media assets.
- **Unified UI**: A sleek, modern interface with a consistent header system and responsive design across all views.
- **Easy Network Access**: The server automatically detects local IPs, making it easy for students to join via their mobile devices on the same Wi-Fi.

### 🚀 Quick Start (Recommended)

#### For Windows Users:
Just double-click **`start_windows.bat`**. 
- It will automatically set up a portable Python environment and install all dependencies. No pre-installed Python required!

#### For macOS Users:
Run **`start_mac.command`**.
- It will set up the virtual environment and launch the server.

---

### Manual Installation (Optional)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YuHyungmin1226/classmap.git
   cd classmap
   ```

2. **Setup environment:**
   - **Windows**: `python -m venv venv` & `venv\Scripts\activate`
   - **macOS/Linux**: `python3 -m venv venv` & `source venv/bin/activate`

3. **Install dependencies & Run:**
   ```bash
   pip install -r requirements.txt
   python run.py
   ```
   The server will start on `http://localhost:5555`. 

4. **Admin Access:**
   Navigate to `/admin/login` (or select Admin via the portal). Default credentials:
   - Password: `admin123`
   (Note: You should change this in the Admin Menu after logging in.)

## Technologies Used
- **Backend**: Python, Flask, Flask-SocketIO, Flask-SQLAlchemy (SQLite)
- **Frontend**: HTML5, Modern CSS (Flexbox/Grid), JavaScript, Socket.io client
- **Mapping**: Leaflet.js, OpenStreetMap
- **Image Processing**: Pillow (PIL)
