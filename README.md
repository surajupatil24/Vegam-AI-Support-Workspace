# Samixa AI Support Assistant

**Internal AI Operating System for Vegam Support Team**

An advanced AI-powered support platform that learns from every ticket, investigation, and resolution to create a unified knowledge base for the entire support team.

## 🎯 Vision

Transform support operations from individual problem-solving to collective intelligence:

- **Reduce investigation time** — AI learns from past solutions
- **Improve first-time resolution** — Access to team's entire knowledge
- **Preserve team knowledge forever** — Never lose institutional knowledge
- **Help new engineers become productive quickly** — Onboarding accelerator
- **Assist Team Leads in monitoring** — Real-time support quality metrics
- **Become the company's internal AI expert** — Years of knowledge in one system

## 🏗️ Architecture

### 5 AI Agents Working Together

```
Ticket Input
    ↓
[Redmine Agent] → Extract complete ticket information
    ↓
[Knowledge Agent] → Find similar previous tickets (vector search)
    ↓
[Code Agent] → Analyze code if applicable
    ↓
[AI Analysis Agent] → ChatGPT/Claude analysis
    ↓
[Communication Agent] → Generate responses ready to send
    ↓
Knowledge Base Storage
    ↓
Next Similar Ticket Becomes Easier
```

### Tech Stack

**Frontend:** React + Next.js + Tailwind CSS + ShadCN UI
**Backend:** FastAPI (Python)
**Database:** PostgreSQL + pgvector (vector search)
**Vector DB:** Qdrant (optional alternative)
**AI:** OpenAI, Claude, Gemini, Azure OpenAI, OpenRouter
**Orchestration:** LangGraph / CrewAI
**Authentication:** Redmine SSO

## 📁 Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry
│   │   ├── config.py                # Configuration
│   │   ├── db/
│   │   │   ├── models.py            # SQLAlchemy models
│   │   │   └── database.py          # DB connection
│   │   ├── agents/
│   │   │   ├── redmine_agent.py     # Ticket extraction
│   │   │   ├── knowledge_agent.py   # Vector search
│   │   │   ├── code_agent.py        # Code analysis
│   │   │   ├── ai_analysis_agent.py # LLM analysis
│   │   │   ├── communication_agent.py # Response generation
│   │   │   └── orchestrator.py      # Multi-agent coordinator
│   │   ├── api/
│   │   │   └── routes/              # API endpoints
│   │   └── utils/
│   │       ├── embedding.py         # Vector operations
│   │       └── redmine_client.py    # Redmine API wrapper
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── login.tsx            # Login page
│   │   │   ├── dashboard.tsx        # Home dashboard
│   │   │   └── investigation.tsx    # Investigation workspace
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── api.ts               # Axios client
│   │   │   └── store.ts             # Zustand store
│   │   └── styles/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   └── .env.example
│
├── docker-compose.yml
├── CLAUDE.md
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- PostgreSQL (or use docker-compose)

### Option 1: Using Docker Compose (Recommended)

```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Update backend/.env with your API keys
# OPENAI_API_KEY=...
# CLAUDE_API_KEY=...
# REDMINE_BASE_URL=...
# REDMINE_API_KEY=...

# Start all services
docker-compose up -d

# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# Database: localhost:5432
```

### Option 2: Local Development

**Backend:**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run migrations (setup)
alembic upgrade head

# Start server
uvicorn app.main:app --reload
# API: http://localhost:8000
```

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Create .env.local
cp .env.example .env.local

# Start dev server
npm run dev
# Frontend: http://localhost:3000
```

## 📊 Key Features

### Home Dashboard
- Horizontal ticket cards (scrollable)
- Quick statistics (assigned, open, resolved, pending)
- Recent activity feed
- "Start Investigation" action

### AI Investigation Workspace
Three-column layout:
- **Left:** List of assigned tickets
- **Center:** AI investigation report with progress timeline
- **Right:** Evidence panel (similar tickets, code refs, previous engineers)

### Progress Timeline
Real-time progress visualization:
```
Reading Ticket        ██████████ Done
Searching Similar     ████████   Running
Analyzing Code        ████       Running
Generating Solution   ██         Waiting
```

### Result Cards
Beautiful, scannable result cards:
- Issue Summary
- Possible Root Cause
- Why AI thinks this
- Evidence
- Similar Tickets
- Code References
- Recommended Investigation
- Recommended Fix
- Client Reply (copy button)
- Redmine Comment (copy button)
- Close Ticket Notes (copy button)

### Admin Panel
- User management
- AI provider configuration (OpenAI, Claude, Gemini, etc.)
- Redmine integration setup
- Repository configuration (GitHub, Azure DevOps, GitLab)
- Knowledge base settings
- Retention policies

### Team Lead Dashboard
- Engineer performance metrics
- Open ticket overview
- Average resolution time
- AI usage analytics
- Critical tickets tracking
- Repeated issues identification
- Knowledge contribution tracking
- AI recommendation accuracy

## 🔐 Authentication

- **Uses Redmine credentials** — No separate account creation
- **SSO Integration** — Same login as Redmine
- **JWT Tokens** — Stateless session management
- **Role-based Access** — Engineer, Lead, Admin roles

## 🤖 AI Agents Detail

### 1. Redmine Agent
Extracts complete ticket information:
- Subject, description, comments
- Attachments and history
- Customer info, module, priority, tracker

### 2. Knowledge Agent
Searches the knowledge base:
- Similar tickets (vector embeddings)
- Similar errors and exceptions
- Previous solutions with confidence scores
- Previous AI conversations on related topics

### 3. Code Agent
Analyzes code repositories:
- Scans relevant modules
- Finds services, APIs, SQL queries
- Identifies classes, controllers
- Flags potential bugs
- Modules: Manufacturing, Picking, Staging, Scheduling, MRP, Dispatch, etc.

### 4. AI Analysis Agent
Uses ChatGPT/Claude for reasoning:
- Analyzes all previous data
- Generates root cause
- Lists possible reasons
- Suggests investigation steps
- Proposes fixes with confidence
- Identifies risks
- Recommends best resolution

### 5. Communication Agent
Generates ready-to-send responses:
- Professional client reply
- Redmine ticket comment
- Closure notes
- Internal investigation notes
- All copy-paste ready

## 📈 Learning & Feedback

The system continuously improves:

1. **Investigation Complete** → Ask: "Was AI Correct? Yes/No"
2. **If Yes** → Increase confidence score
3. **If No** → Store actual solution
4. **Result** → System becomes smarter over time

## 🔗 Integration Points

### Redmine
- OAuth/API Key authentication
- Ticket read/write operations
- Comment management
- Issue history tracking

### Code Repositories
- GitHub/GitLab/Azure DevOps integration
- Code search and analysis
- Commit history review
- Branch structure analysis

### AI Providers
- OpenAI (GPT-4, GPT-3.5)
- Claude (Anthropic)
- Gemini (Google)
- Azure OpenAI
- OpenRouter (multi-provider)

### Vector Database
- pgvector (PostgreSQL extension)
- Qdrant (standalone vector DB)
- OpenAI embeddings
- Custom embeddings

## 📝 API Documentation

### Auth Endpoints
- `POST /api/auth/login` — Redmine login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user

### Ticket Endpoints
- `GET /api/tickets/assigned` — Get assigned tickets
- `GET /api/tickets/{id}` — Get ticket details
- `POST /api/tickets/sync` — Sync from Redmine

### Investigation Endpoints
- `POST /api/investigations/start` — Start AI investigation
- `GET /api/investigations/{id}/progress` — Real-time progress
- `GET /api/investigations/{id}/results` — Investigation results

### Agent Endpoints
- `POST /api/agents/redmine/extract` — Extract ticket
- `POST /api/agents/knowledge/search` — Search knowledge base
- `POST /api/agents/code/analyze` — Analyze code
- `POST /api/agents/ai-analysis/analyze` — AI analysis
- `POST /api/agents/communication/generate` — Generate responses

### Admin Endpoints
- `GET/POST /api/admin/users` — User management
- `POST /api/admin/ai-providers` — Configure AI providers
- `POST /api/admin/redmine-config` — Redmine setup
- `POST /api/admin/knowledge-base/settings` — KB configuration

### Team Lead Endpoints
- `GET /api/team-lead/dashboard` — Dashboard metrics
- `GET /api/team-lead/ai-conversations` — AI history
- `GET /api/team-lead/ai-accuracy` — Accuracy metrics

## 🗄️ Database Schema

Key tables:
- `users` — Support engineers, leads, admins
- `tickets` — Redmine ticket cache
- `investigations` — AI investigation records
- `knowledge_base` — Embedded solutions with vector search
- `ai_providers` — Configured AI provider credentials
- `system_config` — Configuration settings
- `ticket_comments` — Comment history

## 🚀 Development Roadmap

### Phase 1: MVP (In Progress)
- [x] Backend structure
- [x] Frontend structure
- [x] Database schema
- [ ] Agent implementations
- [ ] Redmine API integration
- [ ] Basic UI pages

### Phase 2: Core Agents
- [ ] Redmine Agent (ticket extraction)
- [ ] Knowledge Agent (vector search)
- [ ] Code Agent (repository analysis)
- [ ] AI Analysis Agent (LLM integration)
- [ ] Communication Agent (response generation)

### Phase 3: Production Features
- [ ] Admin panel
- [ ] Team Lead dashboard
- [ ] Feedback loop (AI learning)
- [ ] Advanced analytics
- [ ] API rate limiting
- [ ] Audit logs

### Phase 4: Advanced
- [ ] Multi-language support
- [ ] Advanced embedding models
- [ ] Custom model fine-tuning
- [ ] Mobile app
- [ ] Real-time notifications

## 🛠️ Configuration

All configuration in `.env` files:

**backend/.env:**
```
DATABASE_URL=postgresql://samixa:password@localhost:5432/samixa
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
REDMINE_BASE_URL=http://redmine.example.com
REDMINE_API_KEY=...
```

**frontend/.env.local:**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 📦 Deployment

### Docker Deployment
```bash
docker-compose -f docker-compose.yml up -d
```

### Kubernetes (Future)
- Helm charts for easy deployment
- Auto-scaling agents
- Load balancing

## 📞 Support

For issues or questions:
1. Check CLAUDE.md for detailed architecture
2. Review issue templates
3. Contact team lead

## 📄 License

Proprietary - Vegam Company

---

**Built with ❤️ for Vegam Support Team**
