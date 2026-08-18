"""AIML Interview Assessment Package."""

__version__ = "0.1.0"
__author__ = "Interview Coding Assessment Team"
__description__ = "AI/ML module for interview proctoring and resume analysis"

from pathlib import Path

# Package paths
PACKAGE_ROOT = Path(__file__).parent
DATA_DIR = PACKAGE_ROOT / "data"
SCRIPTS_DIR = PACKAGE_ROOT / "scripts"
MODELS_DIR = PACKAGE_ROOT / "models"

__all__ = [
    "PACKAGE_ROOT",
    "DATA_DIR",
    "SCRIPTS_DIR",
    "MODELS_DIR",
]
