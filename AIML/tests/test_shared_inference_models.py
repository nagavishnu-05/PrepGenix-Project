import sys
import types
import unittest
from unittest.mock import Mock, patch

from face_detection.inference import insightface_app
from face_detection.inference.yolo_face_detector import YOLOFaceDetector


class SharedInferenceModelTests(unittest.TestCase):
    def test_insightface_app_is_loaded_once_for_detection_and_recognition(self):
        insightface_app._APPS.pop("test_shared_pack", None)
        fake_app = Mock()
        fake_face_analysis = Mock(return_value=fake_app)

        with (
            patch.object(insightface_app, "INSIGHTFACE_AVAILABLE", True),
            patch.object(insightface_app, "FaceAnalysis", fake_face_analysis, create=True),
            patch.object(insightface_app, "local_pack_root", return_value=None),
            patch.object(insightface_app, "session_options", return_value=None),
        ):
            detector_app, detector_label = insightface_app.build_insightface_app(
                ["detection"], "test_shared_pack"
            )
            embedding_app, embedding_label = insightface_app.build_insightface_app(
                ["detection", "recognition"], "test_shared_pack"
            )

        self.assertIs(detector_app, embedding_app)
        self.assertEqual(detector_label, embedding_label)
        self.assertEqual(fake_face_analysis.call_count, 1)
        self.assertEqual(
            fake_face_analysis.call_args.kwargs["allowed_modules"],
            ["detection", "recognition"],
        )
        fake_app.prepare.assert_called_once()

    def test_missing_yolo_face_weights_do_not_trigger_network_download_by_default(self):
        fake_yolo = Mock()
        fake_ultralytics = types.SimpleNamespace(YOLO=fake_yolo)
        with (
            patch.dict(sys.modules, {"ultralytics": fake_ultralytics}),
            patch.dict("os.environ", {"YOLO_FACE_ALLOW_DOWNLOAD": "false"}),
        ):
            detector = YOLOFaceDetector(
                weights_path="missing-yolo-face-weights-for-test.pt",
                enabled=True,
            )

        self.assertFalse(detector.available)
        fake_yolo.assert_not_called()


if __name__ == "__main__":
    unittest.main()
