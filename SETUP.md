# Samixa Setup Guide

## Quick Start (Docker - Recommended)

### 1. Prerequisites
- Docker Desktop installed
- 4GB RAM available
- Port 3000, 8000, 5432 available

### 2. Clone & Configure

```bash
# Navigate to project
cd AI_Support_Operating_System

# Copy environment template
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 3. Update Credentials

Edit `backend/.env`:
```env
OPENAI_API_KEY=sk-...                    # Get from https://platform.openai.com
CLAUDE_API_KEY=sk-ant-...                # Get from https://console.anthropic.com
REDMINE_BASE_URL=http://redmine.example.com
REDMINE_API_KEY=your_api_key            # Get from your Redmine admin
```

### 4. Start Services

```bash
# Build and start all containers
docker-compose up -d

# Check logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 5. Verify Services

- **Frontend:** http://localhost:3000 → Should see login page
- **Backend:** http://localhost:8000 → Should return JSON
- **API Docs:** http://localhost:8000/docs → Swagger UI
- **Database:** `psql -h localhost -U samixa -d samixa`

### 6. Stop Services

```bash
docker-compose down
```

---

## Local Development Setup

### Backend Setup

```bash
# 1. Navigate to backend
cd backend

# 2. Create Python virtual environment
python3 -m venv venv

# 3. Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file
cp .env.example .env
# Edit .env with your credentials

# 6. Start PostgreSQL (using Docker)
docker run --name samixa_postgres \
  -e POSTGRES_USER=samixa \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=samixa \
  -p 5432:5432 \
  -d pgvector/pgvector:pg16

# 7. Run database migrations
alembic upgrade head

# 8. Start backend server
uvicorn app.main:app --reload --port 8000
```

Backend should be available at: http://localhost:8000

**API Documentation:** http://localhost:8000/docs

### Frontend Setup

```bash
# 1. Navigate to frontend
cd frontend

# 2. Install Node dependencies
npm install

# 3. Create .env.local
cp .env.example .env.local

# 4. Configure API URL (if backend not on localhost:8000)
# Edit .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000

# 5. Start development server
npm run dev
```

Frontend should be available at: http://localhost:3000

---

## Database Setup

### Using Docker (Recommended)

```bash
docker run --name samixa_postgres \
  -e POSTGRES_USER=samixa \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=samixa \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  -d pgvector/pgvector:pg16
```

### Using Local PostgreSQL

1. Install PostgreSQL with pgvector extension
2. Create database:
```sql
CREATE DATABASE samixa;
CREATE USER samixa WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE samixa TO samixa;
```
3. Enable pgvector:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Run Migrations

```bash
cd backend
alembic upgrade head
```

---

## Configuration Reference

### Backend `.env` Variables

```env
# Application
APP_NAME=Samixa AI Support Assistant
APP_VERSION=1.0.0
DEBUG=True                              # Set to False in production

# Database
DATABASE_URL=postgresql://samixa:password@localhost:5432/samixa
SQLALCHEMY_ECHO=False                   # Set to True for SQL debugging

# Redmine Integration
REDMINE_BASE_URL=http://redmine.example.com
REDMINE_API_KEY=your_redmine_api_key

# AI Providers (get from respective services)
OPENAI_API_KEY=sk-...                   # OpenAI
CLAUDE_API_KEY=sk-ant-...               # Anthropic
GEMINI_API_KEY=...                      # Google
AZURE_OPENAI_KEY=...                    # Azure
OPENROUTER_API_KEY=...                  # OpenRouter

# Vector Database
VECTOR_DB_TYPE=pgvector                 # pgvector or qdrant
QDRANT_URL=http://localhost:6333        # If using Qdrant
QDRANT_API_KEY=your_key

# Security
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
```

### Frontend `.env.local` Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Getting API Keys

### OpenAI API Key
1. Go to https://platform.openai.com/account/api-keys
2. Create new secret key
3. Copy to `OPENAI_API_KEY`

### Claude API Key
1. Go to https://console.anthropic.com
2. Create new API key
3. Copy to `CLAUDE_API_KEY`

### Redmine API Key
1. Log into your Redmine instance
2. Go to Account Settings → API access key
3. Copy to `REDMINE_API_KEY`

### Gemini API Key
1. Go to https://makersuite.google.com/app/apikey
2. Create new key
3. Copy to `GEMINI_API_KEY`

---

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process using port 8000
lsof -i :8000
kill -9 <PID>

# Or change port in backend/app/main.py or docker-compose.yml
```

### Database Connection Error
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Verify credentials
psql -h localhost -U samixa -d samixa -c "SELECT 1"

# Check logs
docker logs samixa_postgres
```

### Module Not Found (Python)
```bash
# Ensure virtual environment is activated
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# Reinstall dependencies
pip install -r requirements.txt
```

### npm/Node Issues
```bash
# Clear cache
npm cache clean --force

# Reinstall node_modules
rm -rf node_modules package-lock.json
npm install
```

### API Returns CORS Error
- Check `CORS_ORIGINS` in `backend/.env`
- Ensure frontend is on whitelisted domain
- Restart backend after changing CORS settings

---

## Development Workflow

### 1. Create Feature Branch
```bash
git checkout -b feature/agent-name
```

### 2. Backend Development
```bash
# Edit backend code
# uvicorn auto-reloads on changes
# Check http://localhost:8000/docs for API changes
```

### 3. Frontend Development
```bash
# Edit frontend code
# Next.js dev server auto-reloads
# Check http://localhost:3000
```

### 4. Database Schema Changes
```bash
cd backend
alembic revision --autogenerate -m "description of change"
alembic upgrade head
```

### 5. Test Changes
```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm run test
```

### 6. Commit & Push
```bash
git add .
git commit -m "feat: description of changes"
git push origin feature/agent-name
```

---

## Production Deployment

### Using Docker Compose
```bash
# Set production environment variables
export DEBUG=False
export SECRET_KEY=your-production-secret-key

# Build and start
docker-compose -f docker-compose.yml up -d

# View logs
docker-compose logs -f
```

### Manual Deployment
1. Set up PostgreSQL database
2. Install Python dependencies: `pip install -r requirements.txt`
3. Run migrations: `alembic upgrade head`
4. Start backend: `gunicorn -w 4 app.main:app --bind 0.0.0.0:8000`
5. Build frontend: `npm run build && npm run start`

### Environment Variables for Production
- Set `DEBUG=False`
- Change `SECRET_KEY` to random value
- Update `DATABASE_URL` to production DB
- Set API keys for all providers
- Update `CORS_ORIGINS` to production domain
- Use production Redmine URL

---

## Monitoring & Logs

### Docker Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Database Logs
```bash
docker logs samixa_postgres
```

### Application Logs
- Backend logs available in FastAPI startup output
- Frontend logs available in browser console

---

## Next Steps After Setup

1. **Test Authentication**
   - Go to http://localhost:3000
   - Try logging in (will fail until auth is implemented)

2. **Explore API**
   - Visit http://localhost:8000/docs
   - Try making requests to endpoints

3. **Check Database**
   - Connect: `psql -h localhost -U samixa -d samixa`
   - List tables: `\dt`
   - View migrations: `SELECT * FROM alembic_version;`

4. **Implement Agents**
   - Start with Redmine Agent
   - Move to Knowledge Agent
   - Implement remaining agents

5. **Build Frontend Pages**
   - Investigation workspace
   - Admin panel
   - Team Lead dashboard

6. **Integration Testing**
   - Test full investigation flow
   - Verify agent orchestration
   - Check vector search functionality

---

## Additional Resources

- FastAPI Documentation: https://fastapi.tiangolo.com/
- Next.js Documentation: https://nextjs.org/docs
- SQLAlchemy Documentation: https://docs.sqlalchemy.org/
- PostgreSQL Documentation: https://www.postgresql.org/docs/
- Tailwind CSS Documentation: https://tailwindcss.com/docs
- Docker Documentation: https://docs.docker.com/

---

## Support

- **Project Documentation:** See README.md and CLAUDE.md
- **API Documentation:** http://localhost:8000/docs (when running)
- **Code Comments:** Search for `TODO:` for incomplete implementations
- **Issues:** Report in project issue tracker
