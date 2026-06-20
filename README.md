# ClassMap & ClassWrite - 교실 협업 플랫폼

Classroom Portal은 실시간 대화형 교실 협업 플랫폼입니다. 수업 활동에 따라 두 가지 모드를 제공합니다:
- **ClassMap**: 참가자가 공유 지도에 핀과 메모를 추가하는 지도 기반 활동
- **ClassWrite**: 참가자가 구조화된 게시물 형식으로 생각을 공유하는 게시판 기반 활동

## 주요 기능

- **실시간 협업**: Socket.IO를 통해 모든 클라이언트 간 핀, 메모, 게시물 즉시 동기화
- **이중 활동 모드**: 공간 활동을 위한 지도 보기 또는 토론을 위한 게시판 보기 선택
- **미디어 업로드**: 이미지 및 동영상 첨부와 인라인 미리보기 및 재생 지원
- **YouTube 연동**: YouTube URL 붙여넣기로 노트나 게시물에 자동 비디오 임베드
- **계층 구조 관리**: 관리자가 여러 클래스와 세션을 관리하고 아카이브 또는 삭제 가능
- **통합 UI**: 일관된 헤더 시스템과 반응형 디자인의 모던 인터페이스
- **간편 네트워크 접속**: 서버가 자동으로 로컬 IP를 감지하여 같은 Wi-Fi 내 모바일 기기로 간편 접속

## 기술 스택

- **Backend**: Python, Flask, Flask-SocketIO
- **데이터베이스**: SQLAlchemy, SQLite
- **Frontend**: HTML, CSS, JavaScript
- **실시간 통신**: Socket.IO

## 빠른 시작 (권장)

### Windows
`start_windows.bat`을 더블클릭하면 포터블 Python 환경을 자동으로 설정하고 모든 의존성을 설치합니다.

### macOS
`start_mac.command`를 실행하면 가상 환경을 설정하고 서버를 실행합니다.

### 수동 설치

```bash
# 의존성 설치
pip install -r requirements.txt

# 서버 실행
python app.py
```

## 라이선스

MIT License
