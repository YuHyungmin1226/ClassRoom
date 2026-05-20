import sqlite3
import shutil
import os
import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'app.db')

def backup_db():
    if not os.path.exists(DB_PATH):
        print(f"[-] 데이터베이스 파일을 찾을 수 없습니다: {DB_PATH}")
        print("    서버를 한 번도 실행하지 않았거나, 올바른 위치에 app.db가 없습니다.")
        return False
    
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = f"{DB_PATH}.backup_{timestamp}"
    
    try:
        shutil.copy2(DB_PATH, backup_path)
        print(f"[+] 백업 성공: 원본 데이터베이스가 안전하게 백업되었습니다.\n    -> {backup_path}")
        return True
    except Exception as e:
        print(f"[-] 백업 실패: {e}")
        return False

def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns

def migrate():
    if not backup_db():
        return
        
    print("\n[+] 마이그레이션 검사를 시작합니다...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # 1. class_group 테이블의 class_type 컬럼 체크 및 추가
        if not column_exists(cursor, 'class_group', 'class_type'):
            print("    -> class_group 테이블에 'class_type' 컬럼을 추가합니다...")
            cursor.execute("ALTER TABLE class_group ADD COLUMN class_type VARCHAR(20) NOT NULL DEFAULT 'classmap'")
            print("    -> 성공!")
        else:
            print("    -> class_group 테이블은 이미 최신 상태입니다.")
            
        # 2. flag 테이블의 post_type 컬럼 체크 및 추가
        if not column_exists(cursor, 'flag', 'post_type'):
            print("    -> flag 테이블에 'post_type' 컬럼을 추가합니다...")
            cursor.execute("ALTER TABLE flag ADD COLUMN post_type VARCHAR(20) NOT NULL DEFAULT 'normal'")
            print("    -> 성공!")
        else:
            print("    -> flag 테이블은 이미 최신 상태입니다.")
            
        conn.commit()
        print("\n[+] 모든 마이그레이션이 성공적으로 완료되었습니다!")
        print("[+] 기존 데이터가 유지된 채 최신 버전과 완벽하게 호환됩니다. 이제 플랫폼을 실행하셔도 좋습니다.")
        
    except Exception as e:
        conn.rollback()
        print(f"\n[-] 마이그레이션 중 오류가 발생했습니다: {e}")
        print("    백업된 파일을 복구하여 다시 시도해 주세요.")
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
