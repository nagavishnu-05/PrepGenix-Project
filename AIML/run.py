#!/usr/bin/env python3
"""Development runner for AIML - similar to 'npm run dev'.

Usage:
  python run.py            # Start API server in dev mode
  python run.py --help     # Show all commands
  python run.py analyze    # Run proctoring analyzer
  python run.py parse      # Run resume parser
"""

import subprocess
import sys
import argparse
import os
from pathlib import Path


def run_server(host='0.0.0.0', port=5000, debug=True):
    """Run Flask development server."""
    print("🚀 Starting AIML API Server (Development Mode)")
    print(f"📍 Server: http://{host}:{port}")
    print("📚 API Docs available at endpoints listed below\n")
    
    env = os.environ.copy()
    env['FLASK_APP'] = 'server.py'
    env['FLASK_ENV'] = 'development'
    
    cmd = [sys.executable, 'server.py']
    try:
        subprocess.run(cmd, env=env, cwd=Path(__file__).parent)
    except KeyboardInterrupt:
        print("\n✋ Server stopped.")


def setup_env():
    """Setup Python environment."""
    print("🔧 Setting up Python environment...")
    
    # Check Python version
    if sys.version_info < (3, 8):
        print("❌ Python 3.8+ required")
        return False
    
    print(f"✅ Python {sys.version.split()[0]}")
    
    # Install dependencies
    print("\n📦 Installing dependencies...")
    try:
        subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'],
            cwd=Path(__file__).parent,
            check=True
        )
        print("✅ Dependencies installed")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install dependencies")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="AIML Development Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start API server (like npm run dev)
  python run.py
  
  # Install dependencies
  python run.py setup
  
  # Run specific commands
  python run.py analyze --image frame.jpg --audio audio.wav
  python run.py parse --input resume.pdf
  
  # Start server on custom port
  python run.py --port 3001
        """
    )
    
    parser.add_argument('command', nargs='?', default='serve',
                       choices=['serve', 'setup', 'analyze', 'parse'],
                       help='Command to run')
    parser.add_argument('--host', default='0.0.0.0', help='Server host')
    parser.add_argument('--port', type=int, default=5000, help='Server port')
    parser.add_argument('--image', help='Image file for analyze')
    parser.add_argument('--audio', help='Audio file for analyze')
    parser.add_argument('--input', help='Input file for parse')
    parser.add_argument('--out', help='Output file')
    
    args = parser.parse_args()
    
    if args.command == 'setup':
        return setup_env()
    
    elif args.command == 'serve':
        run_server(args.host, args.port)
        return True
    
    elif args.command == 'analyze':
        cmd = [sys.executable, 'main.py', 'analyze-proctor']
        if args.image:
            cmd.extend(['--image', args.image])
        if args.audio:
            cmd.extend(['--audio', args.audio])
        try:
            subprocess.run(cmd, cwd=Path(__file__).parent, check=True)
            return True
        except subprocess.CalledProcessError:
            return False
    
    elif args.command == 'parse':
        if not args.input:
            print("❌ --input required for parse command")
            return False
        cmd = [sys.executable, 'main.py', 'parse-resume', '--input', args.input]
        if args.out:
            cmd.extend(['--out', args.out])
        try:
            subprocess.run(cmd, cwd=Path(__file__).parent, check=True)
            return True
        except subprocess.CalledProcessError:
            return False
    
    return True


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
