#!/usr/bin/env python3
"""Flask API server for AIML functionalities."""

from flask import Flask, request, jsonify
from pathlib import Path
import sys
import os
import json

# Add scripts to path
SCRIPTS_DIR = Path(__file__).parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from analyze_proctor import analyze_image, analyze_audio
from parse_resume import extract_text, load_rules, find_skills, categorize

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "AIML Interview Assessment API"
    })


@app.route('/api/analyze-proctor', methods=['POST'])
def api_analyze_proctor():
    """Analyze proctoring data.
    
    Accepts:
      - image: Image file (jpg/png) for face detection
      - audio: Audio file (wav) for voice detection
    
    Returns:
      {
        "image": { faces, facePresent, multipleFaces, note },
        "audio": { voiceDetected, voicedRatio, rms, note }
      }
    """
    try:
        result = {}
        
        # Handle image
        if 'image' in request.files:
            image_file = request.files['image']
            if image_file.filename == '':
                return jsonify({"error": "No image selected"}), 400
            
            # Save temp file
            temp_path = f"/tmp/{image_file.filename}"
            image_file.save(temp_path)
            result["image"] = analyze_image(temp_path)
            os.remove(temp_path)
        
        # Handle audio
        if 'audio' in request.files:
            audio_file = request.files['audio']
            if audio_file.filename == '':
                return jsonify({"error": "No audio selected"}), 400
            
            # Save temp file
            temp_path = f"/tmp/{audio_file.filename}"
            audio_file.save(temp_path)
            result["audio"] = analyze_audio(temp_path)
            os.remove(temp_path)
        
        if not result:
            return jsonify({"error": "Provide at least image or audio"}), 400
        
        return jsonify(result), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/parse-resume', methods=['POST'])
def api_parse_resume():
    """Parse resume and extract skills.
    
    Accepts:
      - file: Resume file (pdf/txt)
    
    Returns:
      {
        "skills": [...],
        "categories": [{ name, score }, ...],
        "text": "extracted text"
      }
    """
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Save temp file
        temp_path = f"/tmp/{file.filename}"
        file.save(temp_path)
        
        # Extract and process
        text = extract_text(temp_path)
        rules = load_rules()
        skills = find_skills(text, rules)
        categories = categorize(text, rules, skills)
        
        result = {
            "skills": skills,
            "categories": categories,
            "text": text[:500] + "..." if len(text) > 500 else text
        }
        
        os.remove(temp_path)
        return jsonify(result), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/available-skills', methods=['GET'])
def available_skills():
    """Get list of available skills from skills.json."""
    try:
        rules = load_rules()
        return jsonify(rules), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors."""
    return jsonify({
        "error": "Endpoint not found",
        "available_endpoints": [
            "GET /api/health",
            "POST /api/analyze-proctor",
            "POST /api/parse-resume",
            "GET /api/available-skills"
        ]
    }), 404


if __name__ == "__main__":
    print("Starting AIML API Server...")
    print("Available endpoints:")
    print("  GET  /api/health")
    print("  POST /api/analyze-proctor")
    print("  POST /api/parse-resume")
    print("  GET  /api/available-skills")
    app.run(
        host=os.environ.get("AIML_HOST", "0.0.0.0"),
        port=int(os.environ.get("AIML_PORT", "5000")),
        debug=os.environ.get("FLASK_ENV") == "development",
        use_reloader=False,
    )
