import sys
import types
import unittest
import builtins
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np

from face_detection.inference import insightface_app
from face_detection.inference.yolo_face_detector import YOLOFaceDetector
from proctoring import object_detector


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
        with (
            patch.object(Path, "is_file", return_value=False),
            patch.dict("os.environ", {"YOLO_FACE_ALLOW_DOWNLOAD": "false"}),
            patch("builtins.__import__", wraps=builtins.__import__) as import_mock,
        ):
            detector = YOLOFaceDetector(
                weights_path="missing-yolo-face-weights-for-test.pt",
                enabled=True,
            )

        self.assertFalse(detector.available)
        self.assertFalse(any(call.args[0] == "ultralytics" for call in import_mock.call_args_list))

    def test_missing_scene_weights_do_not_trigger_runtime_download_by_default(self):
        fake_yolo = Mock()
        fake_ultralytics = types.SimpleNamespace(YOLO=fake_yolo)
        with (
            patch.object(object_detector, "_model", None),
            patch.object(object_detector, "_WEIGHTS", Path(__file__).with_name("missing-yolov8n.pt")),
            patch.object(Path, "is_file", return_value=False),
            patch.dict(sys.modules, {"ultralytics": fake_ultralytics}),
            patch.dict("os.environ", {
                "PROCTORING_DEVICE_MODEL_PATH": "",
                "PROCTORING_DEVICE_MODEL_ALLOW_DOWNLOAD": "false",
            }),
        ):
            self.assertIs(object_detector.get_model(), False)

        fake_yolo.assert_not_called()

    def test_scene_model_runtime_download_requires_explicit_opt_in(self):
        fake_model = Mock()
        fake_yolo = Mock(return_value=fake_model)
        fake_ultralytics = types.SimpleNamespace(YOLO=fake_yolo)
        with (
            patch.object(object_detector, "_model", None),
            patch.object(object_detector, "_WEIGHTS", Path(__file__).with_name("missing-yolov8n.pt")),
            patch.object(Path, "is_file", return_value=False),
            patch.dict(sys.modules, {"ultralytics": fake_ultralytics}),
            patch.dict("os.environ", {
                "PROCTORING_DEVICE_MODEL_PATH": "",
                "PROCTORING_DEVICE_MODEL_ALLOW_DOWNLOAD": "true",
            }),
        ):
            self.assertIs(object_detector.get_model(), fake_model)

        fake_yolo.assert_called_once_with("yolov8n.pt")

    def test_scene_detection_uses_one_reduced_size_pass_by_default(self):
        fake_model = Mock(return_value=[types.SimpleNamespace(names={}, boxes=[])])
        detector = object_detector.SceneObjectDetector()
        self.assertFalse(object_detector._CROP_INFERENCE)
        self.assertEqual(object_detector._IMGSZ, 416)
        with (
            patch.object(object_detector, "get_model", return_value=fake_model),
        ):
            result = detector.detect(np.zeros((240, 320, 3), dtype=np.uint8))

        self.assertTrue(result["available"])
        fake_model.assert_called_once()
        self.assertEqual(fake_model.call_args.kwargs["imgsz"], 416)

    def test_onnx_inference_uses_one_thread_by_default(self):
        options = Mock()
        fake_onnxruntime = types.SimpleNamespace(
            SessionOptions=Mock(return_value=options),
            ExecutionMode=types.SimpleNamespace(ORT_SEQUENTIAL="sequential"),
        )
        with (
            patch.dict(sys.modules, {"onnxruntime": fake_onnxruntime}),
            patch.dict("os.environ", {"ONNX_INTRA_OP_THREADS": ""}),
        ):
            options_result = insightface_app.session_options()

        self.assertIs(options_result, options)
        self.assertEqual(options.intra_op_num_threads, 1)
        self.assertEqual(options.inter_op_num_threads, 1)


if __name__ == "__main__":
    unittest.main()
