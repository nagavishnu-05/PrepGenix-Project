import builtins
import os
import unittest
from unittest.mock import patch

from api.proctoring_api import app


class HealthEndpointTests(unittest.TestCase):
    def test_health_does_not_import_aiml_models_or_configuration(self):
        original_import = builtins.__import__

        def guarded_import(name, *args, **kwargs):
            if name == "face_detection.utils.config":
                raise AssertionError("Health checks must not import AIML configuration")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=guarded_import):
            response = app.test_client().get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")
        self.assertEqual(response.get_json()["service"], "proctoring-api")

    def test_health_reports_environment_feature_flags(self):
        with patch.dict(os.environ, {
            "FACE_DETECTION_ENABLED": "false",
            "FACE_RECOGNITION_ENABLED": "false",
            "LANDMARK_DETECTOR_ENABLED": "false",
            "MEDIAPIPE_ENABLED": "true",
            "HEAD_POSE_ENABLED": "true",
            "GAZE_ENABLED": "false",
            "BLINK_ENABLED": "true",
        }):
            response = app.test_client().get("/health")

        payload = response.get_json()
        self.assertFalse(payload["face_detection_enabled"])
        self.assertFalse(payload["face_recognition_enabled"])
        self.assertFalse(payload["landmarks_enabled"])
        self.assertTrue(payload["head_pose_enabled"])
        self.assertFalse(payload["gaze_enabled"])
        self.assertTrue(payload["blink_enabled"])


if __name__ == "__main__":
    unittest.main()
