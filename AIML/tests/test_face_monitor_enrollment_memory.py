import unittest
from unittest.mock import Mock, patch

import numpy as np

from proctoring.face_detection.face_monitor import FaceMonitor


class FaceMonitorEnrollmentMemoryTests(unittest.TestCase):
    def test_enrollment_keeps_embeddings_but_not_full_camera_frames(self):
        monitor = FaceMonitor.__new__(FaceMonitor)
        monitor.detector = Mock()
        monitor.detector.detect.return_value = {
            "face_count": 1,
            "faces": [{"bbox": [0, 0, 20, 20], "landmarks": None}],
        }
        monitor.embedding = Mock()
        monitor.embedding.generate_embedding_from_crop.return_value = np.ones(4, dtype=np.float32)
        monitor.embedding.aggregate_embeddings.return_value = np.ones(4, dtype=np.float32)
        monitor.embedding.backend_name = "test"
        monitor.embedding.threshold = 0.25
        monitor._enrollment_embeddings = []
        monitor._reference_embedding = None
        monitor._reference_captured = False

        frame = np.ones((40, 40, 3), dtype=np.uint8)
        face_crop = np.ones((20, 20, 3), dtype=np.uint8)
        with (
            patch("proctoring.face_detection.face_monitor.REFERENCE_CAPTURE_FRAMES", 1),
            patch("proctoring.face_detection.face_monitor.crop_face", return_value=face_crop),
            patch(
                "proctoring.face_detection.face_monitor.assess_face_quality",
                return_value={"quality": "good"},
            ),
            patch.object(FaceMonitor, "_quality_meets_enrollment", return_value=True),
        ):
            result = monitor.enroll_capture_frame(frame)

        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(monitor._enrollment_embeddings), 1)
        self.assertFalse(hasattr(monitor, "_enrollment_frames"))


if __name__ == "__main__":
    unittest.main()
