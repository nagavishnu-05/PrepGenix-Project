# Run the AIML service

The AIML folder is the Python part of the project. On Windows, use the included
`dev.bat` commands instead of managing Python packages yourself.

## Windows quick start

You need Python 3.10 installed and available from the `py` or `python` command.
Open a terminal in the repository root and run:

```bat
cd AIML
dev.bat setup
dev.bat serve
```

`setup` is needed once, and again if `requirements.txt` changes. It creates an
isolated environment at `AIML\.venv` and installs the AIML dependencies.
`serve` starts both APIs:

- General API: http://localhost:5000
- Proctoring API: http://localhost:5050

Check the general API at http://localhost:5000/api/health. Keep the terminal
open while using the APIs. Press **Ctrl+C** to stop them.

## Connect the Backend to this Python environment

The Express backend runs the AIML resume and proctoring scripts using
`PYTHON_PATH`. In `Backend\.env`, set:

```env
PYTHON_PATH=../AIML/.venv/Scripts/python.exe
```

This is a path relative to the Backend folder. Restart the backend after
changing `.env`.

## macOS / Linux

From the repository root:

```sh
cd AIML
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

The APIs use the same ports listed above. Activate `.venv` again before running
`python run.py` in a later terminal session.

## Common commands

```bat
dev.bat setup
dev.bat serve
dev.bat serve --port 5001
dev.bat analyze --image frame.jpg --audio audio.wav
dev.bat parse --input resume.pdf
```

The general API's health endpoint is `GET /api/health`; resume parsing is
`POST /api/parse-resume`. The proctoring API health endpoint is
`GET http://localhost:5050/health`; its analysis endpoint is `POST /analyze`.

## Hosted site changes

Running this locally does not change the hosted site. To publish AIML code or
dependency changes, push the changes and redeploy the hosted environment that
runs the Python code. If the hosted backend runs AIML scripts directly, its
deployment must include the `AIML` folder and required Python packages. If AIML
is deployed as a separate service, redeploy that service as well. Configure
`PYTHON_PATH` for the hosted environment; do not point a hosted service at a
local `.venv` or a `localhost` URL.
