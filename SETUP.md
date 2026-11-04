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

The hosted frontend build must define `VITE_API_URL` and `VITE_PROCTORING_API`
with the public URLs of the Express API and Python proctoring API. Vite embeds
these values at build time, so changing them requires a frontend rebuild and
redeploy. Production builds do not fall back to `localhost` for proctoring.
`VITE_FACE_CHECK_INTERVAL_MS` is optional; monitoring defaults to 2000 ms and
accepts a configured interval from 1500 to 5000 ms.

## Email reminders on free-tier hosting

Test and interview reminders use a Google Apps Script relay, which sends email
from the Google account that owns the script without requiring SMTP access or a
custom sending domain.

1. Create a project at [script.google.com](https://script.google.com/) and copy
   the code from
   [`Backend/scripts/reminder-mailer-apps-script.js`](./Backend/scripts/reminder-mailer-apps-script.js)
   into its editor.
2. In **Project Settings**, add a Script Property named `REMINDER_MAIL_TOKEN`.
   Generate a long random value locally and keep it private.
3. Run `authorizeMailSender` in the Apps Script editor once and approve the
   Gmail permission prompt.
4. Choose **Deploy > New deployment > Web app**, set **Execute as** to yourself,
   and set **Who has access** to **Anyone**. Deploy and copy the web app URL.
5. In the backend's hosted environment, set `GMAIL_APPS_SCRIPT_URL` to that URL
   and `GMAIL_APPS_SCRIPT_TOKEN` to the same random value used for the Script
   Property. Set `REMINDER_TIME_ZONE` to the schedule's timezone (for example,
   `Asia/Kolkata`). Also set a separate long, random `REMINDER_CRON_TOKEN`.

Because a sleeping free-tier backend cannot run its in-process timer, configure
an external cron service to send a `POST` request every minute to
`https://<backend-host>/api/cron/reminders` with this header:

```text
Authorization: Bearer <same REMINDER_CRON_TOKEN>
```

Keep the token in the cron provider's secret/header configuration, never in the
request URL. A successful response includes the reminder counts; non-2xx
responses indicate an authentication or delivery/configuration problem. The
backend sends each reminder only to students currently assigned to that test
or to the individual student scheduled for that interview. The Apps Script
relay sends from the Google account used to deploy it and is subject to that
account's daily sending quota.

For AIML-specific commands and endpoints, see
[AIML/GETTING_STARTED.md](./AIML/GETTING_STARTED.md).
