import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import migrate_db


def sqlite_uri(db_path):
    uri_path = Path(db_path).as_posix()
    if os.name == "nt":
        return f"sqlite:///{uri_path}"
    return f"sqlite:////{uri_path.lstrip('/')}"


class SqlitePathTests(unittest.TestCase):
    def test_relative_path_is_resolved_under_instance_directory(self):
        with tempfile.TemporaryDirectory() as instance_dir:
            resolved = migrate_db.resolve_sqlite_db_path(
                "sqlite:///relative-audit.db", instance_dir
            )

            self.assertEqual(
                resolved,
                os.path.abspath(os.path.join(instance_dir, "relative-audit.db")),
            )

    def test_absolute_path_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.abspath(os.path.join(temp_dir, "absolute.db"))

            self.assertEqual(
                migrate_db.resolve_sqlite_db_path(sqlite_uri(db_path), "ignored"),
                db_path,
            )

    def test_non_file_database_is_rejected(self):
        with self.assertRaises(RuntimeError):
            migrate_db.resolve_sqlite_db_path("sqlite:///:memory:")

        with self.assertRaises(RuntimeError):
            migrate_db.resolve_sqlite_db_path("postgresql:///classroom")


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = os.path.join(self.temp_dir.name, "app.db")

    def create_legacy_database(self, *, existing_unique=False):
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE class_group (id TEXT PRIMARY KEY)")
        conn.execute("CREATE TABLE flag (id INTEGER PRIMARY KEY)")
        unique_sql = (
            ", UNIQUE (session_id, question_id, client_id)"
            if existing_unique
            else ""
        )
        conn.execute(
            f"""
            CREATE TABLE quiz_response (
                id INTEGER PRIMARY KEY,
                session_id TEXT NOT NULL,
                question_id INTEGER NOT NULL,
                client_id TEXT NOT NULL
                {unique_sql}
            )
            """
        )
        conn.commit()
        conn.close()

    def get_columns(self, table_name):
        conn = sqlite3.connect(self.db_path)
        try:
            return [
                row[1]
                for row in conn.execute(
                    f"PRAGMA table_info({migrate_db.quote_identifier(table_name)})"
                )
            ]
        finally:
            conn.close()

    def get_indexes(self):
        conn = sqlite3.connect(self.db_path)
        try:
            return list(conn.execute('PRAGMA index_list("quiz_response")'))
        finally:
            conn.close()

    def test_migration_backs_up_deduplicates_and_is_idempotent(self):
        self.create_legacy_database()
        conn = sqlite3.connect(self.db_path)
        conn.executemany(
            """
            INSERT INTO quiz_response
                (id, session_id, question_id, client_id)
            VALUES (?, ?, ?, ?)
            """,
            [(1, "s1", 10, "c1"), (2, "s1", 10, "c1")],
        )
        conn.commit()
        conn.close()

        self.assertTrue(migrate_db.migrate(self.db_path))
        self.assertTrue(migrate_db.migrate(self.db_path))

        self.assertIn("class_type", self.get_columns("class_group"))
        self.assertIn("post_type", self.get_columns("flag"))
        self.assertEqual(
            self.get_columns("upload"),
            [
                "id",
                "session_id",
                "owner_id",
                "purpose",
                "file_path",
                "thumbnail_path",
                "flag_id",
                "question_id",
                "created_at",
            ],
        )
        backups = list(Path(self.temp_dir.name).glob("app.db.backup_*"))
        self.assertEqual(len(backups), 2)

        conn = sqlite3.connect(self.db_path)
        try:
            rows = conn.execute(
                "SELECT id FROM quiz_response ORDER BY id"
            ).fetchall()
            self.assertEqual(rows, [(2,)])
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    """
                    INSERT INTO quiz_response
                        (session_id, question_id, client_id)
                    VALUES ('s1', 10, 'c1')
                    """
                )
        finally:
            conn.close()

        matching = [
            row for row in self.get_indexes()
            if row[1] == "uq_response_session_question_client"
        ]
        self.assertEqual(len(matching), 1)

        conn = sqlite3.connect(self.db_path)
        try:
            upload_indexes = list(conn.execute('PRAGMA index_list("upload")'))
            self.assertTrue(any(row[1] == "ix_upload_question_id" for row in upload_indexes))
            upload_fks = list(conn.execute('PRAGMA foreign_key_list("upload")'))
            self.assertEqual(
                {row[2] for row in upload_fks},
                {"session", "flag", "quiz_question"},
            )
        finally:
            conn.close()

    def test_existing_upload_table_gets_question_link_column(self):
        self.create_legacy_database()
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """
            CREATE TABLE upload (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                purpose TEXT NOT NULL,
                file_path TEXT NOT NULL UNIQUE,
                thumbnail_path TEXT UNIQUE,
                flag_id INTEGER UNIQUE,
                created_at DATETIME NOT NULL
            )
            """
        )
        conn.commit()
        conn.close()

        self.assertTrue(migrate_db.migrate(self.db_path))
        self.assertIn("question_id", self.get_columns("upload"))

    def test_existing_unique_constraint_by_columns_avoids_redundant_index(self):
        self.create_legacy_database(existing_unique=True)

        self.assertTrue(migrate_db.migrate(self.db_path))

        indexes = self.get_indexes()
        self.assertEqual(len(indexes), 1)
        self.assertTrue(indexes[0][1].startswith("sqlite_autoindex_quiz_response_"))

    def test_differently_named_unique_index_avoids_redundant_index(self):
        self.create_legacy_database()
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """
            CREATE UNIQUE INDEX legacy_response_unique
            ON quiz_response (session_id, question_id, client_id)
            """
        )
        conn.commit()
        conn.close()

        self.assertTrue(migrate_db.migrate(self.db_path))

        indexes = self.get_indexes()
        self.assertEqual(len(indexes), 1)
        self.assertEqual(indexes[0][1], "legacy_response_unique")

    def test_failure_rolls_back_prior_schema_change(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE class_group (id TEXT PRIMARY KEY)")
        conn.commit()
        conn.close()

        self.assertFalse(migrate_db.migrate(self.db_path))

        self.assertNotIn("class_type", self.get_columns("class_group"))
        self.assertEqual(
            len(list(Path(self.temp_dir.name).glob("app.db.backup_*"))), 1
        )

    def test_cli_returns_nonzero_when_database_is_missing(self):
        missing_path = os.path.join(self.temp_dir.name, "missing.db")
        env = os.environ.copy()
        env["DATABASE_URL"] = sqlite_uri(missing_path)

        result = subprocess.run(
            [sys.executable, str(Path(migrate_db.__file__))],
            cwd=str(Path(migrate_db.__file__).parent),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)


if __name__ == "__main__":
    unittest.main()
