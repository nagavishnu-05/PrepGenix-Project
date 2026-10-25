# Run PrepGenix locally

The project has a React frontend, an Express backend, and Python AIML APIs.
Start them in two terminals: the root `npm run dev` starts the frontend and
backend together, and the AIML runner starts both Python APIs.

## Before you start

- Node.js and npm
- Python 3.10 (Windows: available as `py` or `python`)
- A MongoDB connection configured in `Backend/.env`

## 1. Start Frontend and Backend

In a terminal at the repository root:

```sh
npm install
npm install --prefix Backend
npm install --prefix Frontend
npm run dev
```

The first three commands install dependencies; only `npm run dev` is needed on
later runs.

This starts:

- Frontend: http://localhost:5173
- Backend: http://localhost:8080

If this is your first run, create `Backend/.env` using
[Backend/.env.example](./Backend/.env.example) and configure its database
connection before starting the backend.

## 2. Set up and start AIML

Open a second terminal at the repository root.

### Windows

```bat
cd AIML
dev.bat setup
dev.bat serve
```

Run `dev.bat setup` once, and again if `AIML/requirements.txt` changes. It
creates `AIML\.venv` and installs the Python dependencies. `dev.bat serve`
starts:

- General API: http://localhost:5000
- Proctoring API: http://localhost:5050

Check the general API at http://localhost:5000/api/health. Keep the terminal
open while developing and press **Ctrl+C** to stop the services.

For the Backend to use the same Python packages, add this to `Backend/.env`:

```env
PYTHON_PATH=../AIML/.venv/Scripts/python.exe
```

Restart the backend after changing `.env`.

### macOS / Linux

```sh
cd AIML
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

Set `PYTHON_PATH` in `Backend/.env` to `../AIML/.venv/bin/python` so the backend
uses these installed packages.

## Stop the project

Press **Ctrl+C** in both terminals. Restart each service after changing its
code; the frontend/backend development servers reload their code automatically.

## Do local changes update the hosted site?

No. Local edits only affect your computer. To publish a change, push it to the
repository and deploy the service you changed:

- Frontend changes: redeploy the hosted frontend.
- Backend changes: redeploy the hosted backend.
- AIML code or dependency changes: redeploy the environment that runs the AIML
  Python scripts. If AIML is hosted separately, redeploy that service too.

If the repository is connected to automatic deployments, pushing may trigger
the deployment. Confirm the hosted build succeeds and check that deployment
environment variables use hosted values, not `localhost` or a local `.venv`.

For AIML-specific commands and endpoints, see
[AIML/GETTING_STARTED.md](./AIML/GETTING_STARTED.md).
