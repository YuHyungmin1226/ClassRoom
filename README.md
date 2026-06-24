# Classroom Portal - 교실 협업 플랫폼

Classroom Portal은 실시간 대화형 교실 협업 플랫폼입니다. 수업 활동에 따라 다섯 가지 모드를 제공합니다:
- **ClassMap**: 참가자가 공유 지도에 핀과 메모를 추가하는 지도 기반 활동
- **ClassWrite**: 참가자가 구조화된 게시물 형식으로 생각을 공유하는 게시판 기반 활동
- **ClassDraw**: 하나의 캔버스에서 함께 그림을 그리는 실시간 드로잉 활동
- **ClassQuiz**: 2022 개정 교육과정(중학교) 5과목 문제 풀에서 과목·학년을 골라 푸는 퀴즈 활동
- **ClassGame**: ClassQuiz로 모은 포인트를 사용해 즐기는 학습 보상 게임 모음(LikeDIA 등)

## 주요 기능

- **실시간 협업**: Socket.IO를 통해 모든 클라이언트 간 핀, 메모, 게시물 즉시 동기화
- **사지선다 협업 모드**: 지도(ClassMap) · 게시판(ClassWrite) · 드로잉(ClassDraw) · 퀴즈(ClassQuiz)
- **ClassQuiz 문제 풀**: 국어·영어·수학·사회/역사·과학 × 중1~3 과목별 문제 은행에서 **한 번에 30문제** 무작위 출제
  - **자동 채점 + 해설**, **틀린 문제 재풀이**, **결과 PDF 다운로드**(한글 폰트 지원)
  - **만점(100점) 시 1포인트** 획득(기기 단위 누적)
  - 수학은 파라미터 기반 자동 생성기로 학년당 1,000여 문제, 영어는 검증 단어 사전, 국어·사회·과학은 검증된 용어 사전 기반으로 자동 생성(+큐레이션·엑셀 업로드)
- **ClassGame 포인트 게임**: ClassQuiz로 모은 포인트(기기 단위)를 소모해 게임 플레이. 첫 게임으로 디아블로 스타일 액션 RPG **LikeDIA** 번들(정적 웹게임)
- **미디어 업로드**: 이미지 및 동영상 첨부와 인라인 미리보기 및 재생 지원
- **YouTube 연동**: YouTube URL 붙여넣기로 노트나 게시물에 자동 비디오 임베드
- **계층 구조 관리**: 관리자가 여러 클래스와 세션을 관리하고 아카이브 또는 삭제 가능
- **간편 네트워크 접속**: 서버가 자동으로 로컬 IP를 감지하여 같은 Wi-Fi 내 모바일 기기로 간편 접속

## 기술 스택

- **Backend**: Python, Flask, Flask-SocketIO
- **데이터베이스**: SQLAlchemy, SQLite
- **Frontend**: HTML, CSS, JavaScript
- **실시간 통신**: Socket.IO
- **문서 생성**: ReportLab(결과 PDF), openpyxl(퀴즈 엑셀 입출력)

## 빠른 시작 (권장)

### Windows
`start_windows.bat`을 더블클릭하면 포터블 Python 환경을 자동으로 설정하고 모든 의존성을 설치합니다.

### macOS
`start_mac.command`를 실행하면 가상 환경을 설정하고 서버를 실행합니다.

### 수동 설치

```bash
# 의존성 설치
pip install -r requirements.txt

# (최초 1회) ClassQuiz 문제 풀 적재
python seed_questions.py        # 과목별 큐레이션 문제 적재
python generate_questions.py    # 수학·영어 자동 생성 문제 적재

# 서버 실행 (http://localhost:5555)
python run.py
```

> ClassQuiz 문제는 `app/seed_data/*.json`(큐레이션)과 `app/quiz_generators.py`(자동 생성)에서 관리합니다.
> 관리자 화면 `/admin/quiz`에서 과목·학년별 보유 문항 수를 확인하고 엑셀로 문제를 일괄 추가할 수 있습니다.

## 라이선스

MIT License
