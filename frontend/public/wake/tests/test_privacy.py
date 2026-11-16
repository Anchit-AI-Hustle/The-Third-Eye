"""Offline tests only. No audio device, model, helper, or network is started."""
import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.modules["sounddevice"] = types.ModuleType("sounddevice")
vosk = types.ModuleType("vosk")
vosk.KaldiRecognizer = vosk.Model = vosk.SetLogLevel = lambda *a: None
sys.modules["vosk"] = vosk
spec = importlib.util.spec_from_file_location("wake_fixture", Path(__file__).resolve().parents[1] / "wake.py")
wake = importlib.util.module_from_spec(spec)
with patch.dict(os.environ, {"THIRD_EYE_LIFELOG": "0"}):
    spec.loader.exec_module(wake)

class WakePrivacy(unittest.TestCase):
    def test_saved_token_cannot_enable_logging(self):
        with patch.object(wake, "token", return_value="synthetic"):
            self.assertFalse(wake.logging_enabled())

    def test_delivery_drops_audio_in_wake_only_mode(self):
        with patch.object(wake, "post") as post:
            wake.deliver(b"synthetic", 0, 45000, False)
            post.assert_not_called()

    def test_post_refuses_even_with_stale_token(self):
        with patch.object(wake, "token", return_value="synthetic"), patch.object(wake.urllib.request, "urlopen") as network:
            with self.assertRaisesRegex(RuntimeError, "disabled"):
                wake.post("/api/transcribe", b"synthetic", "audio/wav")
            network.assert_not_called()

    def test_lifelog_requires_both_explicit_flag_and_token(self):
        with patch.object(wake, "LIFELOG_ENABLED", True), patch.object(wake, "token", return_value=""):
            self.assertFalse(wake.logging_enabled())
        with patch.object(wake, "LIFELOG_ENABLED", True), patch.object(wake, "token", return_value="synthetic"):
            self.assertTrue(wake.logging_enabled())

if __name__ == "__main__":
    unittest.main()
