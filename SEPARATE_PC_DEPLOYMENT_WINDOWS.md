# Samixa Deployment Guide For A Separate Windows PC

This guide is for installing Samixa on another Windows machine.

It is written for this repository as it exists today:
- Backend: FastAPI
- Frontend: Next.js
- Storage: local SQLite or PostgreSQL
- File storage: local folders on disk

For one separate local PC, the simplest and most stable setup is:
- Backend on the same PC
- Frontend on the same PC
- SQLite database on the same PC
- Local storage folders for ticket attachments, knowledge files, and feedback

If you later want multi-user or heavier production usage, move the database to PostgreSQL.

## 1. Recommended Deployment Mode

Use this mode if Samixa will run on one Windows PC:
- Backend runs on port `8000`
- Frontend runs on port `3000`
- Database uses local SQLite file `backend\\samixa-local.db`
- Stored files remain inside:
  - `backend\\knowledge_uploads`
  - `backend\\feedback_uploads`
  - `backend\\ticket_attachments`

## 2. What To Copy To The New PC

Copy the full project folder to the new machine, for example:

```text
D:\AI_Support_Operating_System
```

If you want to migrate existing learned data and saved ticket files from the current PC, also make sure these are included:
- `backend\\samixa-local.db`
- `backend\\knowledge_uploads`
- `backend\\feedback_uploads`
- `backend\\ticket_attachments`

Do not rely on the current `backend\\.env` file from another machine unless you review it first.

## 3. Software Needed On The New PC

Install these first:

1. Python 3.11
2. Node.js 20 LTS
3. Git
4. Optional: NSSM if you want Samixa to run as Windows services

Verify:

```powershell
python --version
node --version
npm --version
git --version
```

## 4. Backend Configuration On The New PC

Open:

```text
backend\.env
```

Use values like this for a simple single-PC install:

```env
APP_NAME=Samixa AI Support Assistant
APP_VERSION=1.0.0
DEBUG=False

DATABASE_URL=sqlite:///./samixa-local.db
SQLALCHEMY_ECHO=False

REDMINE_BASE_URL=https://support.vegam.co
REDMINE_API_KEY=YOUR_REDMINE_API_KEY

OPENAI_API_KEY=
CLAUDE_API_KEY=
GEMINI_API_KEY=
AZURE_OPENAI_KEY=
OPENROUTER_API_KEY=

SECRET_KEY=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

CORS_ORIGINS=["http://127.0.0.1:3000","http://localhost:3000"]
```

Notes:
- `DATABASE_URL=sqlite:///./samixa-local.db` is the easiest setup for one PC.
- If you want AI provider features, fill in the provider key you actually use.
- Change `SECRET_KEY` to your own value.

## 5. Frontend Configuration On The New PC

Create or update:

```text
frontend\.env.local
```

Use:

```env
INTERNAL_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_API_URL=/api
```

This matches the current `frontend/next.config.js` rewrite behavior.

## 6. Install Backend Dependencies

Open PowerShell:

```powershell
cd D:\AI_Support_Operating_System\backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

## 7. Install Frontend Dependencies

Open another PowerShell window:

```powershell
cd D:\AI_Support_Operating_System\frontend
npm install
npm run build
```

## 8. Start Samixa Manually

### Start backend

```powershell
cd D:\AI_Support_Operating_System\backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Start frontend

Open another PowerShell window:

```powershell
cd D:\AI_Support_Operating_System\frontend
npm run start -- --hostname 127.0.0.1 --port 3000
```

### Open in browser

- Frontend: `http://127.0.0.1:3000`
- Backend docs: `http://127.0.0.1:8000/docs`

## 9. If You Want To Access It From Another PC In The Same Network

If the Samixa server runs on one Windows PC but you want to open it from another PC:

### Backend

Start backend with:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

Start frontend with:

```powershell
npm run start -- --hostname 0.0.0.0 --port 3000
```

### Frontend env

Keep:

```env
INTERNAL_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_API_URL=/api
```

### Firewall

Allow inbound ports:
- `3000`
- `8000`

Then open from another PC using:

```text
http://YOUR_SERVER_PC_IP:3000
```

If you use LAN access, also update backend CORS:

```env
CORS_ORIGINS=["http://127.0.0.1:3000","http://localhost:3000","http://YOUR_SERVER_PC_IP:3000"]
```

## 10. Optional: Code Intelligence Repository Path

If you want code-analysis features on the new PC, the Vegam code repository must also exist on that machine.

After deployment, configure the repository path in Samixa Settings or Admin so the new machine points to its own local copy of the codebase.

Example path on the new PC:

```text
D:\VegamSolutions\vegam4icomplete
```

Do not keep the old machine path if that path does not exist on the new PC.

## 11. Keep Samixa Running After Reboot

For a stable Windows setup, use NSSM.

### Backend service

Create a service such as `SamixaBackend`:
- Application: `D:\AI_Support_Operating_System\backend\venv\Scripts\python.exe`
- Arguments: `-m uvicorn app.main:app --host 127.0.0.1 --port 8000`
- Startup directory: `D:\AI_Support_Operating_System\backend`

### Frontend service

Create a service such as `SamixaFrontend`:
- Application: `C:\Program Files\nodejs\npm.cmd`
- Arguments: `run start -- --hostname 127.0.0.1 --port 3000`
- Startup directory: `D:\AI_Support_Operating_System\frontend`

After creating both services:

```powershell
nssm start SamixaBackend
nssm start SamixaFrontend
```

## 12. Backup Items On The New PC

Back up these regularly:
- `backend\\samixa-local.db`
- `backend\\knowledge_uploads`
- `backend\\feedback_uploads`
- `backend\\ticket_attachments`
- `backend\\.env`
- `frontend\\.env.local`

## 13. Update Procedure On The New PC

When you receive a newer version of the project:

1. Stop backend and frontend
2. Replace project code with the new version
3. Keep your data folders and env files
4. Reinstall dependencies if requirements changed
5. Rebuild frontend
6. Start backend and frontend again

Commands:

```powershell
cd D:\AI_Support_Operating_System\backend
.\venv\Scripts\activate
pip install -r requirements.txt

cd D:\AI_Support_Operating_System\frontend
npm install
npm run build
```

## 14. Troubleshooting

### Frontend opens slowly or hangs in dev mode
Do not use `npm run dev` for deployment.
Use:

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

### Backend starts but shows database fallback warnings
Set this in `backend\\.env`:

```env
DATABASE_URL=sqlite:///./samixa-local.db
```

### Redmine login works but tickets do not load
Check:
- `REDMINE_BASE_URL`
- `REDMINE_API_KEY`
- network access from the new PC to Redmine

### Attachments or knowledge files disappear
Check that these folders still exist:
- `backend\\knowledge_uploads`
- `backend\\feedback_uploads`
- `backend\\ticket_attachments`

## 15. Recommended Final Setup For Your Separate PC

For your case, I recommend this exact setup:

1. Deploy the project folder to the new Windows PC
2. Use SQLite with:
   - `DATABASE_URL=sqlite:///./samixa-local.db`
3. Use production frontend:
   - `npm run build`
   - `npm run start -- --hostname 127.0.0.1 --port 3000`
4. Use backend:
   - `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
5. If you want auto-start after reboot, register both with NSSM
6. Back up the database and storage folders regularly

## 16. Validation Checklist

After deployment, verify:

1. `http://127.0.0.1:8000/health` returns `{"status":"ok"}`
2. `http://127.0.0.1:3000` opens the login page
3. Redmine login works
4. Assigned tickets load
5. Conversation tab opens
6. Attachments appear for tickets that have Redmine files
7. New ticket attachments are saved under `backend\\ticket_attachments`

