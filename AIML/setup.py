"""Setup configuration for AIML package."""
from setuptools import setup, find_packages

setup(
    name="aiml-interview",
    version="0.1.0",
    description="AI/ML module for Interview Coding Assessment Platform",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "tensorflow",
        "keras",
        "opencv-python",
        "scikit-learn",
        "pandas",
        "numpy",
        "jupyter",
        "onnx",
        "pypdf",
        "flask",  # For API server
    ],
    entry_points={
        "console_scripts": [
            "aiml-run=main:run_all",
            "aiml-server=server:start_server",
        ],
    },
)
