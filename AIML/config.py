"""Configuration management for AIML module."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

# Flask
class FlaskConfig:
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    FLASK_DEBUG = os.getenv("FLASK_DEBUG", "True").lower() == "true"

# Server
class ServerConfig:
    HOST = os.getenv("SERVER_HOST", "0.0.0.0")
    PORT = int(os.getenv("SERVER_PORT", "5000"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_FILE_SIZE", 52428800))  # 50MB

# Database
class DatabaseConfig:
    MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    DATABASE_NAME = os.getenv("DATABASE_NAME", "interview_assessment")

# Backend API
class BackendConfig:
    API_URL = os.getenv("BACKEND_API_URL", "http://localhost:3000")

# Models
class ModelConfig:
    USE_GPU = os.getenv("USE_GPU", "False").lower() == "true"
    MODEL_PRECISION = os.getenv("MODEL_PRECISION", "float32")

# Paths
class PathConfig:
    AIML_ROOT = Path(__file__).parent
    DATA_DIR = AIML_ROOT / "data"
    SCRIPTS_DIR = AIML_ROOT / "scripts"
    MODELS_DIR = AIML_ROOT / "models"
    NOTEBOOKS_DIR = AIML_ROOT / "notebooks"
    UPLOAD_TEMP_DIR = os.getenv("UPLOAD_TEMP_DIR", "/tmp")

# Consolidated Config
class Config:
    """Main configuration class."""
    
    # Flask
    FLASK_ENV = FlaskConfig.FLASK_ENV
    FLASK_DEBUG = FlaskConfig.FLASK_DEBUG
    
    # Server
    SERVER_HOST = ServerConfig.HOST
    SERVER_PORT = ServerConfig.PORT
    MAX_CONTENT_LENGTH = ServerConfig.MAX_CONTENT_LENGTH
    
    # Database
    MONGODB_URI = DatabaseConfig.MONGODB_URI
    DATABASE_NAME = DatabaseConfig.DATABASE_NAME
    
    # Backend
    BACKEND_API_URL = BackendConfig.API_URL
    
    # Models
    USE_GPU = ModelConfig.USE_GPU
    MODEL_PRECISION = ModelConfig.MODEL_PRECISION
    
    # Paths
    AIML_ROOT = PathConfig.AIML_ROOT
    DATA_DIR = PathConfig.DATA_DIR
    SCRIPTS_DIR = PathConfig.SCRIPTS_DIR
    MODELS_DIR = PathConfig.MODELS_DIR
    NOTEBOOKS_DIR = PathConfig.NOTEBOOKS_DIR
    UPLOAD_TEMP_DIR = PathConfig.UPLOAD_TEMP_DIR
    
    @classmethod
    def get(cls, key: str, default=None):
        """Get configuration value by key."""
        return getattr(cls, key, default)
    
    @classmethod
    def print_config(cls):
        """Print current configuration (for debugging)."""
        print("=" * 60)
        print("AIML Configuration")
        print("=" * 60)
        print(f"Environment: {cls.FLASK_ENV}")
        print(f"Debug Mode: {cls.FLASK_DEBUG}")
        print(f"Server: {cls.SERVER_HOST}:{cls.SERVER_PORT}")
        print(f"Max File Size: {cls.MAX_CONTENT_LENGTH / (1024*1024):.1f} MB")
        print(f"MongoDB: {cls.MONGODB_URI}")
        print(f"Use GPU: {cls.USE_GPU}")
        print(f"Data Dir: {cls.DATA_DIR}")
        print("=" * 60)
