.PHONY: help install dev serve analyze parse setup clean lint test

PYTHON := python3
PIP := pip3

help:
	@echo ""
	@echo "AIML Interview Assessment Platform - Development Commands"
	@echo "==========================================================="
	@echo ""
	@echo "Available commands:"
	@echo "  make install    - Install dependencies"
	@echo "  make dev        - Start development server (default port 5000)"
	@echo "  make serve      - Start API server"
	@echo "  make setup      - Setup environment"
	@echo "  make analyze    - Run proctoring analyzer"
	@echo "  make parse      - Run resume parser"
	@echo "  make clean      - Clean up cache files"
	@echo "  make lint       - Run code linting"
	@echo ""
	@echo "Examples:"
	@echo "  make dev PORT=3001"
	@echo "  make analyze IMAGE=frame.jpg AUDIO=audio.wav"
	@echo "  make parse INPUT=resume.pdf"
	@echo ""

install:
	@echo "[*] Installing dependencies..."
	$(PIP) install -r requirements.txt
	@echo "[✓] Dependencies installed"

dev: install
	@echo ""
	@echo "[*] Starting AIML Development Server..."
	@echo "[→] Server running on http://0.0.0.0:$(PORT)"
	$(PYTHON) run.py serve $(PORT)

serve: install
	$(PYTHON) run.py serve

setup:
	$(PYTHON) run.py setup

analyze:
	@echo "[*] Running proctoring analyzer..."
	$(PYTHON) main.py analyze-proctor $(if $(IMAGE),--image $(IMAGE)) $(if $(AUDIO),--audio $(AUDIO))

parse:
	@echo "[*] Running resume parser..."
	@if [ -z "$(INPUT)" ]; then \
		echo "[!] Error: INPUT required (make parse INPUT=resume.pdf)"; \
		exit 1; \
	fi
	$(PYTHON) main.py parse-resume --input $(INPUT) $(if $(OUT),--out $(OUT))

clean:
	@echo "[*] Cleaning up..."
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	rm -rf .env
	@echo "[✓] Cleanup complete"

lint:
	@echo "[*] Running linter..."
	$(PYTHON) -m pylint scripts/*.py 2>/dev/null || echo "[!] pylint not installed"
	$(PYTHON) -m py_compile scripts/*.py main.py server.py run.py || echo "[!] Syntax errors found"

test:
	@echo "[*] Running tests..."
	@echo "[→] Test suite not implemented yet"

PORT ?= 5000
