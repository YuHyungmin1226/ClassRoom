import datetime
import os
import shutil
import sqlite3

from sqlalchemy.engine import make_url

from app.config import Config


PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
INSTANCE_PATH = os.path.join(PROJECT_ROOT, "instance")
RESPONSE_UNIQUE_COLUMNS = ("session_id", "question_id", "client_id")


def resolve_sqlite_db_path(uri, instance_path=INSTANCE_PATH):
    """Resolve a SQLite URL using Flask-SQLAlchemy's instance-path rules."""
    url = make_url(uri)
    if url.drivername not in {"sqlite", "sqlite+pysqlite"}:
        raise RuntimeError(
            "migrate_db.py only supports SQLite databases. "
            f"Current SQLALCHEMY_DATABASE_URI is: {uri}"
        )

    database = url.database
    if database is None or database in {"", ":memory:"}:
        raise RuntimeError("migrate_db.py requires a file-based SQLite database.")

    # Flask-SQLAlchemy strips the file: prefix before resolving SQLite URI paths.
    if url.query.get("uri", False):
        if not database.startswith("file:"):
            raise RuntimeError(f"Invalid SQLite file URI: {uri}")
        database = database[5:]

    if not os.path.isabs(database):
        database = os.path.join(instance_path, database)

    return os.path.abspath(database)


def get_sqlite_db_path():
    return resolve_sqlite_db_path(Config.SQLALCHEMY_DATABASE_URI)


DB_PATH = get_sqlite_db_path()


def backup_db(db_path=None):
    db_path = db_path or DB_PATH
    if not os.path.exists(db_path):
        print(f"[-] 데이터베이스 파일을 찾을 수 없습니다: {db_path}")
        print("    서버를 한 번도 실행하지 않았거나, 올바른 위치에 app.db가 없습니다.")
        return None

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    backup_path = f"{db_path}.backup_{timestamp}"

    try:
        shutil.copy2(db_path, backup_path)
        print(
            "[+] 백업 성공: 원본 데이터베이스가 안전하게 백업되었습니다."
            f"\n    -> {backup_path}"
        )
        return backup_path
    except OSError as exc:
        print(f"[-] 백업 실패: {exc}")
        return None


def quote_identifier(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({quote_identifier(table_name)})")
    return any(row[1] == column_name for row in cursor.fetchall())


def table_exists(cursor, table_name):
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def unique_index_exists_for_columns(cursor, table_name, columns):
    """Return True for either a unique constraint or index on exact columns."""
    cursor.execute(f"PRAGMA index_list({quote_identifier(table_name)})")
    for row in cursor.fetchall():
        index_name = row[1]
        is_unique = bool(row[2])
        is_partial = bool(row[4]) if len(row) > 4 else False
        if not is_unique or is_partial:
            continue

        cursor.execute(f"PRAGMA index_info({quote_identifier(index_name)})")
        indexed_columns = tuple(index_row[2] for index_row in cursor.fetchall())
        if indexed_columns == tuple(columns):
            return True

    return False


def ensure_upload_table(cursor):
    if not table_exists(cursor, "upload"):
        cursor.execute(
            """
            CREATE TABLE upload (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                session_id VARCHAR(36) NOT NULL,
                owner_id VARCHAR(100) NOT NULL,
                purpose VARCHAR(20) NOT NULL DEFAULT 'flag',
                file_path VARCHAR(255) NOT NULL UNIQUE,
                thumbnail_path VARCHAR(255) UNIQUE,
                flag_id INTEGER UNIQUE,
                question_id INTEGER,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(session_id) REFERENCES session (id),
                FOREIGN KEY(flag_id) REFERENCES flag (id),
                FOREIGN KEY(question_id) REFERENCES quiz_question (id) ON DELETE SET NULL
            )
            """
        )
        print("    -> upload 테이블을 생성했습니다.")
    elif not column_exists(cursor, "upload", "question_id"):
        cursor.execute(
            "ALTER TABLE upload ADD COLUMN question_id INTEGER "
            "REFERENCES quiz_question(id) ON DELETE SET NULL"
        )
        print("    -> upload 테이블에 question_id 컬럼을 추가했습니다.")

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_upload_question_id "
        "ON upload (question_id)"
    )


def migrate(db_path=None):
    db_path = db_path or DB_PATH
    print("[!] 계속하기 전에 실행 중인 서버(run.py)를 반드시 종료하세요.")
    print(
        "    서버가 DB 파일을 열어둔 상태로 백업/마이그레이션을 진행하면 "
        "데이터가 손상될 수 있습니다.\n"
    )
    if backup_db(db_path) is None:
        return False

    print("\n[+] 마이그레이션 검사를 시작합니다...")
    conn = None

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")

        if not column_exists(cursor, "class_group", "class_type"):
            print("    -> class_group 테이블에 'class_type' 컬럼을 추가합니다...")
            cursor.execute(
                "ALTER TABLE class_group ADD COLUMN class_type "
                "VARCHAR(20) NOT NULL DEFAULT 'classmap'"
            )
            print("    -> 성공!")
        else:
            print("    -> class_group 테이블은 이미 최신 상태입니다.")

        if not column_exists(cursor, "flag", "post_type"):
            print("    -> flag 테이블에 'post_type' 컬럼을 추가합니다...")
            cursor.execute(
                "ALTER TABLE flag ADD COLUMN post_type "
                "VARCHAR(20) NOT NULL DEFAULT 'normal'"
            )
            print("    -> 성공!")
        else:
            print("    -> flag 테이블은 이미 최신 상태입니다.")

        ensure_upload_table(cursor)

        if table_exists(cursor, "quiz_response"):
            if not unique_index_exists_for_columns(
                cursor, "quiz_response", RESPONSE_UNIQUE_COLUMNS
            ):
                print(
                    "    -> quiz_response 중복 응답을 정리하고 "
                    "유니크 인덱스를 생성합니다..."
                )
                cursor.execute(
                    """
                    DELETE FROM quiz_response
                    WHERE id NOT IN (
                        SELECT MAX(id) FROM quiz_response
                        GROUP BY session_id, question_id, client_id
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE UNIQUE INDEX uq_response_session_question_client
                    ON quiz_response (session_id, question_id, client_id)
                    """
                )
                print("    -> 성공!")
            else:
                print("    -> quiz_response 유니크 제약은 이미 최신 상태입니다.")
        else:
            print(
                "    -> quiz_response 테이블이 아직 없습니다 "
                "(서버 최초 실행 시 자동 생성)."
            )

        conn.commit()
        print("\n[+] 모든 마이그레이션이 성공적으로 완료되었습니다!")
        print(
            "[+] 기존 데이터가 유지된 채 최신 버전과 호환됩니다. "
            "이제 플랫폼을 실행하셔도 좋습니다."
        )
        return True
    except (OSError, sqlite3.Error) as exc:
        if conn is not None and conn.in_transaction:
            conn.rollback()
        print(f"\n[-] 마이그레이션 중 오류가 발생했습니다: {exc}")
        print("    백업된 파일을 복구하여 다시 시도해 주세요.")
        return False
    finally:
        if conn is not None:
            conn.close()


def main():
    return 0 if migrate() else 1


if __name__ == "__main__":
    raise SystemExit(main())
