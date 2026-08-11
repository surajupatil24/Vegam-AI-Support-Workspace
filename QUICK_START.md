# Samixa - Quick Start Guide

## 🚀 Start in 5 Minutes

### Prerequisites
- Docker & Docker Compose (easiest)
- OR: Python 3.11+, Node 18+, PostgreSQL

---

## Option 1: Docker Compose (Recommended) - 3 Steps

```bash
# 1. Setup
cd AI_Support_Operating_System
cp backend/.env.example backend/.env

# 2. Edit backend/.env with your Redmine credentials:
# REDMINE_BASE_URL=http://your-redmine.com
# REDMINE_API_KEY=your_api_key
# OPENAI_API_KEY=sk-...
# CLAUDE_API_KEY=sk-ant-...

# 3. Start everything
docker-compose up -d

# Check status
docker-compose ps
```

**Services will be available at:**
- 🎨 Frontend: http://localhost:3000
- 🔧 API: http://localhost:8000
- 📚 API Docs: http://localhost:8000/docs
- 🗄️ Database: localhost:5432

---

## Option 2: Local Development - 10 Minutes

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup .env
cp .env.example .env
# Edit .env with your credentials

# Start PostgreSQL (in another terminal if not using docker)
docker run --name samixa_postgres \
  -e POSTGRES_USER=samixa \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=samixa \
  -p 5432:5432 \
  -d pgvector/pgvector:pg16

# Initialize database
python init_db.py create
python init_db.py seed

# Start backend
python -m uvicorn app.main:app --reload
```

Backend will be available at: http://localhost:8000

### Frontend Setup (In another terminal)

```bash
cd frontend

# Install dependencies
npm install

# Setup env
cp .env.example .env.local

# Start dev server
npm run dev
```

Frontend will be available at: http://localhost:3000

---

## 🧪 Test the Application

### 1. Test Redmine Connection

```bash
# Using curl
curl -X POST http://localhost:8000/api/agents/redmine/extract \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": 1}'

# Expected response:
# {
#   "ticket_id": 1,
#   "subject": "...",
#   "status": "success",
#   "comments_count": 5,
#   ...
# }
```

### 2. Test Authentication

```bash
# Login with Redmine credentials
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_redmine_username",
    "password": "your_redmine_password"
  }'

# Expected response:
# {
#   "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
#   "token_type": "bearer",
#   "user": {
#     "id": 1,
#     "username": "...",
#     "email": "...",
#     "full_name": "..."
#   }
# }
```

### 3. Get Current User

```bash
# Using the token from login
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Get Assigned Tickets

```bash
curl -X GET http://localhost:8000/api/tickets/assigned \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Start Investigation

```bash
curl -X POST http://localhost:8000/api/investigations/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "ticket_id": 1
  }'
```

---

## 📊 Database Commands

### Initialize Database

```bash
cd backend

# Create tables
python init_db.py create

# Add sample data
python init_db.py seed

# Reset database (careful!)
python init_db.py reset
```

### Connect to Database

```bash
psql -h localhost -U samixa -d samixa

# List tables
\dt

# View users
SELECT * FROM users;

# View tickets
SELECT * FROM tickets;
```

---

## 🔍 What's Working Now

### ✅ Implemented
1. **Redmine Agent** - Extracts tickets from Redmine
2. **Authentication** - Redmine login with JWT tokens
3. **Database** - PostgreSQL with pgvector extension
4. **API Routes** - All endpoints with proper structure
5. **Frontend** - Login page and dashboard template

### 🔄 In Progress
1. **Knowledge Agent** - Vector search for similar tickets
2. **Code Agent** - Repository analysis
3. **AI Analysis Agent** - ChatGPT/Claude integration
4. **Communication Agent** - Response generation

### ⏳ Coming Next
1. Investigation workspace UI
2. Admin panel
3. Team lead dashboard
4. Multi-agent orchestration

---

## 📚 API Documentation

**Interactive Docs:** http://localhost:8000/docs

**Key Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with Redmine credentials |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/tickets/assigned` | Get assigned tickets |
| POST | `/api/agents/redmine/extract` | Extract ticket from Redmine |
| GET | `/api/agents/redmine/{id}/cached` | Get cached ticket |
| POST | `/api/investigations/start` | Start AI investigation |
| GET | `/api/investigations/{id}/progress` | Get investigation progress |

---

## 🛠️ Troubleshooting

### Port Already in Use
```bash
# Find and kill process
lsof -i :8000  # Find process on port 8000
kill -9 <PID>
```

### Database Connection Error
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Verify connection
psql -h localhost -U samixa -d samixa -c "SELECT 1"
```

### Module Import Error
```bash
# Make sure you're in the correct directory
cd backend

# Activate virtual environment
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Redmine Connection Failed
- Check `REDMINE_BASE_URL` in `.env`
- Check `REDMINE_API_KEY` is valid
- Test with curl:
```bash
curl -X GET http://your-redmine-url/users/current.json \
  -H "X-Redmine-API-Key: YOUR_API_KEY"
```

---

## 📖 Documentation

- **Setup Instructions:** [SETUP.md](SETUP.md)
- **Project Structure:** [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- **Implementation Roadmap:** [NEXT_STEPS.md](NEXT_STEPS.md)
- **Full README:** [README.md](README.md)
- **Project Spec:** [CLAUDE.md](CLAUDE.md)

---

## 🎯 Next Steps

1. **Test the system** using the endpoints above
2. **Verify database** with sample data
3. **Check frontend** can login
4. **Read NEXT_STEPS.md** for implementation roadmap

---

## 💬 Need Help?

Check the error logs:
```bash
# Backend logs
docker-compose logs -f backend

# Frontend logs
npm run dev  # Shows logs in terminal

# Database logs
docker logs samixa_postgres
```

---

**Ready to build? Let's go! 🚀**
