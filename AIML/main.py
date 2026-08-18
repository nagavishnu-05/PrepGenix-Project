#!/usr/bin/env python3
"""Main entry point for AIML functionalities.

Provides CLI to run all AIML services and scripts.
Usage:
  python main.py --help
  python main.py analyze-proctor --image <path> [--audio <path>]
  python main.py parse-resume --input <path>
  python main.py start-server
"""

import argparse
import json
import sys
import os
from pathlib import Path

# Add scripts to path
SCRIPTS_DIR = Path(__file__).parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))


def run_analyze_proctor(args):
    """Run proctoring analysis."""
    from analyze_proctor import analyze_image, analyze_audio
    
    result = {}
    
    if args.image:
        if not os.path.exists(args.image):
            print(f"Error: Image file not found: {args.image}")
            return False
        result["image"] = analyze_image(args.image)
    
    if args.audio:
        if not os.path.exists(args.audio):
            print(f"Error: Audio file not found: {args.audio}")
            return False
        result["audio"] = analyze_audio(args.audio)
    
    print(json.dumps(result, indent=2))
    return True


def run_parse_resume(args):
    """Run resume parsing."""
    from parse_resume import extract_text, load_rules, find_skills, categorize
    
    if not os.path.exists(args.input):
        print(f"Error: Resume file not found: {args.input}")
        return False
    
    try:
        text = extract_text(args.input)
        rules = load_rules()
        skills = find_skills(text, rules)
        categories = categorize(text, rules, skills)
        
        result = {
            "skills": skills,
            "categories": categories,
            "text": text[:500] + "..." if len(text) > 500 else text
        }
        
        if args.out:
            with open(args.out, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)
            print(f"Output saved to: {args.out}")
        else:
            print(json.dumps(result, indent=2))
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False


def start_server(host='0.0.0.0', port=5000):
    """Start Flask API server."""
    print(f"Starting AIML API server on {host}:{port}")
    print("Endpoints:")
    print(f"  POST /api/analyze-proctor - Analyze proctoring (image/audio)")
    print(f"  POST /api/parse-resume - Parse resume and extract skills")
    
    try:
        from server import app
        app.run(host=host, port=port, debug=True)
    except ImportError:
        print("Error: Flask server module not found. Install with: pip install -r requirements.txt")
        return False
    return True


def run_all():
    """Main entry point with CLI."""
    parser = argparse.ArgumentParser(
        description="AIML Interview Assessment - Main Entry Point",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Analyze proctoring with image
  python main.py analyze-proctor --image frame.jpg
  
  # Analyze proctoring with image and audio
  python main.py analyze-proctor --image frame.jpg --audio audio.wav
  
  # Parse resume
  python main.py parse-resume --input resume.pdf --out result.json
  
  # Start API server
  python main.py start-server --port 5000
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # analyze-proctor command
    analyze_parser = subparsers.add_parser('analyze-proctor', help='Analyze proctoring data')
    analyze_parser.add_argument('--image', help='Path to image file (jpg/png)')
    analyze_parser.add_argument('--audio', help='Path to audio file (wav)')
    
    # parse-resume command
    resume_parser = subparsers.add_parser('parse-resume', help='Parse resume file')
    resume_parser.add_argument('--input', required=True, help='Path to resume file (pdf/txt)')
    resume_parser.add_argument('--out', help='Output JSON file path (optional)')
    
    # start-server command
    server_parser = subparsers.add_parser('start-server', help='Start Flask API server')
    server_parser.add_argument('--host', default='0.0.0.0', help='Server host (default: 0.0.0.0)')
    server_parser.add_argument('--port', type=int, default=5000, help='Server port (default: 5000)')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return False
    
    if args.command == 'analyze-proctor':
        if not args.image and not args.audio:
            print("Error: Provide at least --image or --audio")
            return False
        return run_analyze_proctor(args)
    
    elif args.command == 'parse-resume':
        return run_parse_resume(args)
    
    elif args.command == 'start-server':
        return start_server(args.host, args.port)
    
    return False


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)
