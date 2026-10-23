"""Capture evidence/ownership guards, without a window, SDK call or recorder."""
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
import capture

class CaptureGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.lock = self.root / 'lock'
        self.lock.mkdir()
        self.patches = [patch.object(capture, 'LOCK', self.lock), patch.object(capture, 'STATE', self.lock / 'window-recording.json'),
                        patch.object(capture, 'helper', side_effect=AssertionError('Invalid capture must not touch the window'))]
        for p in self.patches: p.start()
    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()
    def test_no_capture_without_vvd_lease(self):
        self.lock.rmdir()
        with self.assertRaisesRegex(RuntimeError, 'Acquire'):
            capture.command('screenrecord screenshot ' + str(self.root))
    def test_missing_screenshot_directory_is_a_failure(self):
        with self.assertRaisesRegex(RuntimeError, 'existing directory'):
            capture.command('screenrecord screenshot ' + str(self.root / 'missing'))
        self.assertFalse((self.root / 'missing').exists())
    def test_an_occupied_recording_is_never_replaced(self):
        owner = '{"pid":42,"nonce":"another recording"}'
        capture.STATE.write_text(owner)
        with self.assertRaisesRegex(RuntimeError, 'already owned'):
            capture.command('screenrecord start ' + str(self.root / 'next.mp4'))
        self.assertEqual(capture.STATE.read_text(), owner)
    def test_short_video_cannot_pass_from_a_success_callback(self):
        job = self.root / 'job'; job.mkdir()
        (job / 'done.json').write_text(json.dumps({'pass': True, 'durationSeconds': 8}))
        out = self.root / 'short.mp4'
        capture.STATE.write_text(json.dumps({'pid': 42, 'job': str(job), 'output': str(out), 'started': 0, 'limit': 8}))
        probe = {'streams': [{'codec_name': 'h264', 'width': 1920, 'height': 1080}], 'format': {'duration': '.075', 'size': '20'}}
        with patch.object(capture.time, 'monotonic', return_value=10), patch.object(capture.subprocess, 'check_output', return_value=json.dumps(probe).encode()):
            with self.assertRaisesRegex(RuntimeError, 'duration; capture rejected'):
                capture.command('screenrecord stop')
        self.assertTrue(capture.STATE.exists())
        self.assertFalse(pathlib.Path(str(out) + '.capture.json').exists())

if __name__ == '__main__': unittest.main()
