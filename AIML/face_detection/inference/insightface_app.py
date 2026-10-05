"""Shared InsightFace app construction.

Detection and recognition both come from the same InsightFace model pack, so
they are built here to guarantee both components resolve the same weights and
the same compute provider.
"""

import logging
import os
from pathlib import Path

from ..utils.config import FACE_MODEL_PACK, INSIGHTFACE_MODEL_ROOT

logger = logging.getLogger(__name__)

INSIGHTFACE_AVAILABLE = False
try:
    from insightface.app import FaceAnalysis

    INSIGHTFACE_AVAILABLE = True
except ImportError:
    pass


def onnx_providers() -> list:
    providers = ["CPUExecutionProvider"]
    if os.environ.get("USE_GPU", "false").lower() == "true":
        providers.insert(0, "CUDAExecutionProvider")
    return providers


def local_pack_root(pack: str) -> Path | None:
    """Return the pack root that insightface should use, if a local pack exists.

    InsightFace resolves models as `<root>/models/<pack>`, so the project keeps
    its packs at `models/insightface/models/<pack>`. Only the `.onnx` files that
    are actually needed are placed there, so startup stays light.
    """
    if not pack:
        return None
    candidate = INSIGHTFACE_MODEL_ROOT / "models" / pack
    if candidate.is_dir() and any(candidate.glob("*.onnx")):
        return INSIGHTFACE_MODEL_ROOT
    return None


def session_options():
    """Session options that keep several InsightFace sessions from fighting.

    ONNX Runtime defaults to one intra-op thread per core *and* spin-waits after
    every run. With a detector, a recogniser and a scene model all resident,
    those spinning pools starve each other and per-frame latency balloons. A few
    non-spinning threads per session is far faster in practice.
    """
    try:
        import onnxruntime as ort
    except ImportError:
        return None

    try:
        threads = int(os.environ.get("ONNX_INTRA_OP_THREADS", "0"))
    except ValueError:
        threads = 0
    try:
        options = ort.SessionOptions()
        if threads > 0:
            options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.log_severity_level = 3
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        return options
    except Exception as exc:  # noqa: BLE001 - defaults are fine too
        logger.debug("Falling back to default onnxruntime session options: %s", exc)
        return None


def build_insightface_app(allowed_modules: list, pack: str | None = None):
    """Build a prepared FaceAnalysis app, or return None if InsightFace is unusable.

    Returns (app, label) where label names the pack actually loaded.
    """
    if not INSIGHTFACE_AVAILABLE:
        return None, None

    name = (pack or FACE_MODEL_PACK or "buffalo_l").strip().lower()
    root = local_pack_root(name)
    root_arg = str(root) if root is not None else None
    try:
        kwargs = {
            "providers": onnx_providers(),
            "allowed_modules": list(allowed_modules),
            "sess_options": session_options(),
        }
        if root_arg:
            kwargs["root"] = root_arg
        app = FaceAnalysis(name=name, **kwargs)
        label = f"{name} (local)" if root is not None else name
        return app, label
    except Exception as exc:  # noqa: BLE001 - fall through to other backends
        logger.warning("InsightFace pack '%s' failed to load: %s", name, exc)
        return None, None