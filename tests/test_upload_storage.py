import os
import tempfile
import unittest
from unittest import mock

import app as app_package
from app import create_app, migrate_legacy_uploads
from app.config import Config, basedir


class UploadStorageConfigTests(unittest.TestCase):
    def test_default_upload_folder_is_private_instance_storage(self):
        expected = os.path.join(basedir, 'instance', 'uploads')

        self.assertEqual(os.path.normcase(Config.UPLOAD_FOLDER), os.path.normcase(expected))
        self.assertNotEqual(
            os.path.commonpath((Config.UPLOAD_FOLDER, os.path.join(basedir, 'app', 'static'))),
            os.path.join(basedir, 'app', 'static'),
        )

    def test_app_rejects_upload_storage_inside_public_static_folder(self):
        public_uploads = os.path.join(basedir, 'app', 'static', 'uploads')

        with self.assertRaisesRegex(ValueError, 'outside the public static folder'):
            create_app({
                'TESTING': True,
                'UPLOAD_FOLDER': public_uploads,
                'LEGACY_UPLOAD_FOLDER': os.path.join(basedir, 'legacy-uploads'),
            })


class LegacyUploadMigrationTests(unittest.TestCase):
    def test_migration_detaches_public_directory_and_quarantines_leftovers(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            legacy_folder = os.path.join(temp_dir, 'app', 'static', 'uploads')
            upload_folder = os.path.join(temp_dir, 'instance', 'uploads')
            quarantine_root = os.path.join(temp_dir, 'instance', 'upload-quarantine')
            os.makedirs(legacy_folder)
            os.makedirs(upload_folder)

            self._write(os.path.join(legacy_folder, 'new.txt'), b'new upload')
            self._write(os.path.join(legacy_folder, 'collision.txt'), b'legacy upload')
            self._write(os.path.join(upload_folder, 'collision.txt'), b'current upload')
            nested_folder = os.path.join(legacy_folder, 'nested')
            os.makedirs(nested_folder)
            self._write(os.path.join(nested_folder, 'leftover.txt'), b'leftover')

            real_move = app_package._move_regular_file_exclusive

            def assert_detached_before_move(source, destination):
                self.assertFalse(os.path.lexists(legacy_folder))
                return real_move(source, destination)

            with mock.patch.object(
                app_package,
                '_move_regular_file_exclusive',
                side_effect=assert_detached_before_move,
            ):
                quarantine_path = migrate_legacy_uploads(
                    legacy_folder,
                    upload_folder,
                    quarantine_root,
                )

            self.assertFalse(os.path.lexists(legacy_folder))
            self.assertEqual(self._read(os.path.join(upload_folder, 'new.txt')), b'new upload')
            self.assertEqual(
                self._read(os.path.join(upload_folder, 'collision.txt')),
                b'current upload',
            )
            self.assertIsNotNone(quarantine_path)
            self.assertEqual(
                self._read(os.path.join(quarantine_path, 'collision.txt')),
                b'legacy upload',
            )
            self.assertEqual(
                self._read(os.path.join(quarantine_path, 'nested', 'leftover.txt')),
                b'leftover',
            )
            self.assertEqual(
                os.path.commonpath((quarantine_path, quarantine_root)),
                quarantine_root,
            )

    def test_migration_removes_empty_quarantine_after_all_files_move(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            legacy_folder = os.path.join(temp_dir, 'app', 'static', 'uploads')
            upload_folder = os.path.join(temp_dir, 'instance', 'uploads')
            quarantine_root = os.path.join(temp_dir, 'instance', 'upload-quarantine')
            os.makedirs(legacy_folder)
            self._write(os.path.join(legacy_folder, 'upload.txt'), b'contents')

            quarantine_path = migrate_legacy_uploads(
                legacy_folder,
                upload_folder,
                quarantine_root,
            )

            self.assertIsNone(quarantine_path)
            self.assertFalse(os.path.lexists(legacy_folder))
            self.assertEqual(
                self._read(os.path.join(upload_folder, 'upload.txt')),
                b'contents',
            )
            self.assertEqual(os.listdir(quarantine_root), [])

    @staticmethod
    def _write(path, contents):
        with open(path, 'wb') as file_handle:
            file_handle.write(contents)

    @staticmethod
    def _read(path):
        with open(path, 'rb') as file_handle:
            return file_handle.read()


if __name__ == '__main__':
    unittest.main()
