import unittest
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np

from proctoring.face_detection.face_monitor import FaceMonitor
from proctoring.face_detection.violation_manager import ViolationManager


class FaceDetectionToggleTests(unittest.TestCase):
    def test_face_detector_is_skipped_but_scene_detection_continues(self):
        monitor = FaceMonitor.__new__(FaceMonitor)
        monitor._face_detection_enabled = True
        monitor._scene_cycle = 0
        monitor._last_scene = {}
        monitor._reference_captured = False
        monitor._reference_embedding = None
        monitor._last_identity_detail = {}
        monitor.detector = Mock()
        monitor.detector.backend_name = "test"
        monitor.landmarks = SimpleNamespace(backend_name="test")
        monitor.blink = Mock()
        monitor.analyzer = Mock()
        monitor.analyzer.analyze.return_value = SimpleNamespace(
            looking_away=False,
            head_turned=False,
            prolonged_closure=False,
            eyes_closed=False,
            blink_count=0,
            head_direction="center",
            gaze_direction="center",
        )
        monitor.liveness = None
        monitor.scene_detector = Mock()
        monitor.scene_detector.detect.return_value = {
            "personCount": 2,
            "devices": [],
            "deviceDetected": False,
        }
        monitor.violation_manager = Mock()
        monitor.violation_manager.update.return_value = {
            "violations": [],
            "violation_count": 0,
            "should_auto_submit": False,
            "device_state": {},
            "identity_blocked": False,
            "identity_status": "disabled",
            "identity_block_reason": None,
            "identity_block_seconds": 0,
            "info_logs": [],
        }
        monitor._metrics_to_dict = Mock(return_value={})

        result = monitor.monitor_frame(np.ones((40, 40, 3), dtype=np.uint8), face_detection_enabled=False)

        monitor.detector.detect.assert_not_called()
        monitor.scene_detector.detect.assert_called_once()
        detection_result = monitor.violation_manager.update.call_args.args[0]
        self.assertFalse(detection_result["face_detection_enabled"])
        self.assertEqual(result["person_count"], 2)
        self.assertTrue(detection_result["scene_detection_fresh"])

        monitor.monitor_frame(np.ones((40, 40, 3), dtype=np.uint8), face_detection_enabled=False)
        detection_result = monitor.violation_manager.update.call_args.args[0]
        monitor.scene_detector.detect.assert_called_once()
        self.assertFalse(detection_result["scene_detection_fresh"])

    def test_cached_scene_result_is_not_counted_as_new_evidence(self):
        manager = ViolationManager(max_violations=10, auto_submit=False)
        manager._start_time -= manager._grace_seconds + 1
        manager._device_tracker = Mock()
        manager._device_tracker.snapshot.return_value = {"level": "none", "devices": []}

        result = manager.update({
            "face_detection_enabled": False,
            "face_present": False,
            "face_count": 0,
            "camera_active": True,
            "person_count": 2,
            "devices": [{"label": "cell phone", "confidence": 0.5, "box": {}}],
            "scene_detection_fresh": False,
        })

        manager._device_tracker.update.assert_not_called()
        self.assertEqual(len(manager._multiple_person_frames), 0)
        self.assertEqual(result["device_state"]["level"], "none")

    def test_fresh_scene_result_updates_temporal_evidence(self):
        manager = ViolationManager(max_violations=10, auto_submit=False)
        manager._start_time -= manager._grace_seconds + 1
        manager._device_tracker = Mock()
        manager._device_tracker.update.return_value = {"level": "none", "devices": []}

        manager.update({
            "face_detection_enabled": False,
            "face_present": False,
            "face_count": 0,
            "camera_active": True,
            "person_count": 2,
            "devices": [],
            "scene_detection_fresh": True,
        })

        manager._device_tracker.update.assert_called_once_with([])
        self.assertEqual(len(manager._multiple_person_frames), 1)

    def test_disabling_face_checks_keeps_person_monitoring_active(self):
        manager = ViolationManager(max_violations=10, auto_submit=False)
        manager._start_time -= manager._grace_seconds + 1
        result = None

        for _ in range(3):
            result = manager.update({
                "face_detection_enabled": False,
                "face_present": False,
                "face_count": 0,
                "match": False,
                "camera_active": True,
                "quality": "poor",
                "looking_away": True,
                "head_turned": True,
                "eyes_closed": True,
                "person_count": 2,
                "devices": [],
            })

        violation_types = {violation["type"] for violation in result["violations"]}
        self.assertIn("MULTIPLE_PERSONS", violation_types)
        self.assertNotIn("NO_FACE", violation_types)
        self.assertNotIn("IDENTITY_MISMATCH", violation_types)
        self.assertNotIn("LOOKING_AWAY", violation_types)
        self.assertFalse(result["identity_blocked"])
        self.assertEqual(result["identity_status"], "disabled")


if __name__ == "__main__":
    unittest.main()
