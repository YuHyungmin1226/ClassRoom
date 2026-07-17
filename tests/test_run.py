import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from werkzeug.security import check_password_hash


class AdminPasswordResetTests(unittest.TestCase):
    def test_reset_password_command_updates_admin_and_exits(self):
        project_root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / 'app.db'
            env = os.environ.copy()
            env.update({
                'ADMIN_PASSWORD': 'recovered-password',
                'CLASSROOM_LEGACY_UPLOAD_FOLDER': str(Path(temp_dir) / 'legacy-uploads'),
                'CLASSROOM_UPLOAD_FOLDER': str(Path(temp_dir) / 'uploads'),
                'DATABASE_URL': f"sqlite:///{database_path.as_posix()}",
                'SECRET_KEY': 'reset-command-test-secret',
            })

            result = subprocess.run(
                [sys.executable, 'run.py', '--reset-admin-password'],
                cwd=project_root,
                env=env,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('[Security] New admin password: recovered-password', result.stdout)
            self.assertNotIn('Classroom Server is running!', result.stdout)
            connection = sqlite3.connect(database_path)
            try:
                row = connection.execute('SELECT password_hash FROM admin LIMIT 1').fetchone()
            finally:
                connection.close()
            self.assertIsNotNone(row)
            self.assertTrue(check_password_hash(row[0], 'recovered-password'))


if __name__ == '__main__':
    unittest.main()
