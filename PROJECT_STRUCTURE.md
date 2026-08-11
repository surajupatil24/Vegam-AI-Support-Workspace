# Project Structure Overview

```
AI_Support_Operating_System/
│
├── backend/                          # FastAPI Backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app entry point
│   │   ├── config.py                # Environment configuration
│   │   │
│   │   ├── db/                      # Database layer
│   │   │   ├── __init__.py
│   │   │   ├── database.py          # SQLAlchemy setup, SessionLocal
│   │   │   └── models.py            # SQLAlchemy models
│   │   │                             #   - User, Ticket, Investigation
│   │   │                             #   - KnowledgeBase, AIProvider
│   │   │
│   │   ├── agents/                  # AI Agents
│   │   │   ├── __init__.py
│   │   │   ├── redmine_agent.py     # Ticket extraction agent
│   │   │   ├── knowledge_agent.py   # Vector search agent
│   │   │   ├── code_agent.py        # Code analysis agent
│   │   │   ├── ai_analysis_agent.py # LLM analysis agent
│   │   │   ├── communication_agent.py # Response generation agent
│   │   │   └── orchestrator.py      # Multi-agent coordinator
│   │   │
│   │   ├── api/                     # API Routes
│   │   │   ├── __init__.py
│   │   │   └── routes/
│   │   │       ├── __init__.py
│   │   │       ├── auth.py          # Authentication endpoints
│   │   │       ├── tickets.py       # Ticket management
│   │   │       ├── investigations.py # Investigation workflow
│   │   │       ├── redmine_agent.py # Redmine agent routes
│   │   │       ├── knowledge_agent.py # Knowledge agent routes
│   │   │       ├── code_agent.py    # Code agent routes
│   │   │       ├── ai_analysis_agent.py # AI analysis routes
│   │   │       ├── communication_agent.py # Communication routes
│   │   │       ├── admin.py         # Admin panel routes
│   │   │       └── team_lead.py     # Team lead dashboard routes
│   │   │
│   │   └── utils/                   # Utility functions
│   │       ├── __init__.py
│   │       ├── embedding.py         # Vector embedding operations
│   │       ├── redmine_client.py    # Redmine API wrapper
│   │       └── auth.py              # JWT token management
│   │
│   ├── tests/                       # Test suite
│   │   ├── __init__.py
│   │   ├── test_agents.py
│   │   ├── test_api.py
│   │   └── test_integration.py
│   │
│   ├── migrations/                  # Alembic database migrations
│   │   └── versions/
│   │
│   ├── requirements.txt             # Python dependencies
│   ├── Dockerfile                   # Docker image
│   ├── .env.example                 # Environment template
│   └── .dockerignore
│
├── frontend/                        # Next.js Frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── _app.tsx            # App wrapper
│   │   │   ├── _document.tsx       # HTML document
│   │   │   ├── index.tsx           # Redirect page
│   │   │   ├── login.tsx           # Login page
│   │   │   ├── dashboard.tsx       # Home dashboard
│   │   │   ├── investigation/
│   │   │   │   ├── [id].tsx        # Investigation workspace
│   │   │   │   └── index.tsx       # Investigation list
│   │   │   ├── admin/
│   │   │   │   ├── users.tsx       # User management
│   │   │   │   ├── ai-providers.tsx # AI provider config
│   │   │   │   └── settings.tsx    # System settings
│   │   │   └── team-lead/
│   │   │       └── dashboard.tsx   # Team lead dashboard
│   │   │
│   │   ├── components/             # React components
│   │   │   ├── Layout.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TicketCard.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── ResultCard.tsx
│   │   │   └── ...
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts             # Axios API client
│   │   │   ├── store.ts           # Zustand state management
│   │   │   ├── types.ts           # TypeScript types
│   │   │   └── utils.ts           # Helper functions
│   │   │
│   │   ├── styles/
│   │   │   └── globals.css        # Global styles
│   │   │
│   │   └── hooks/                 # Custom React hooks
│   │       ├── useAuth.ts
│   │       ├── useTickets.ts
│   │       └── ...
│   │
│   ├── public/                    # Static assets
│   │   ├── favicon.ico
│   │   └── logo.svg
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env.example
│   └── .eslintrc.json
│
├── docs/                          # Documentation
│   ├── API.md                     # API documentation
│   ├── ARCHITECTURE.md            # System architecture
│   ├── AGENTS.md                  # Agent documentation
│   └── DEPLOYMENT.md              # Deployment guide
│
├── .gitignore                     # Git ignore
├── docker-compose.yml             # Docker compose setup
├── CLAUDE.md                      # Project specification
├── README.md                      # Main readme
├── PROJECT_STRUCTURE.md           # This file
├── SETUP.md                       # Setup instructions
└── CONTRIBUTING.md                # Contribution guidelines
```

## Directory Purposes

### Backend (`/backend`)
- **main.py**: FastAPI application initialization and middleware setup
- **config.py**: Environment variables and settings management
- **db/**: Database models and connection management
- **agents/**: The 5 AI agents that process tickets
- **api/routes/**: REST API endpoints organized by feature
- **utils/**: Helper functions (embeddings, API clients)

### Frontend (`/frontend`)
- **pages/**: Next.js pages (routing is file-based)
- **components/**: Reusable React components
- **lib/**: Utilities, API client, state management
- **styles/**: CSS and Tailwind configuration

### Configuration Files
- **docker-compose.yml**: Multi-container setup (backend, frontend, DB, cache)
- **requirements.txt**: Python dependencies
- **package.json**: Node.js dependencies
- **.env.example**: Template for environment variables

## Key Files

### Backend Core
- `backend/app/main.py` - Start here to understand the API structure
- `backend/app/db/models.py` - Database schema
- `backend/app/agents/orchestrator.py` - Agent coordination logic

### Frontend Core
- `frontend/src/pages/login.tsx` - Authentication entry point
- `frontend/src/pages/dashboard.tsx` - Main interface
- `frontend/src/lib/api.ts` - API communication

### Configuration
- `backend/.env.example` - Copy to `.env` and fill with credentials
- `frontend/.env.example` - Copy to `.env.local`

## Module Dependencies

```
pages/
  ↓
components/ & hooks/
  ↓
lib/api.ts
  ↓
backend/api/routes/
  ↓
backend/agents/
  ↓
backend/db/models/
  ↓
PostgreSQL + pgvector
```

## Data Flow

### Ticket Investigation Flow
```
1. User clicks "Start Investigation" on ticket
   ↓
2. POST /api/investigations/start
   ↓
3. Backend creates Investigation record
   ↓
4. Agent Orchestrator runs sequentially:
   - Redmine Agent (extract ticket)
   - Knowledge Agent (search similar)
   - Code Agent (analyze code)
   - AI Analysis Agent (LLM reasoning)
   - Communication Agent (generate responses)
   ↓
5. Frontend polls GET /api/investigations/{id}/progress
   ↓
6. User sees real-time progress updates
   ↓
7. GET /api/investigations/{id}/results for final report
   ↓
8. User copies responses to Redmine
   ↓
9. User marks ticket as resolved and provides feedback
```

## Testing Structure

```
backend/tests/
  ├── test_agents.py       # Agent unit tests
  ├── test_api.py          # API endpoint tests
  ├── test_integration.py  # End-to-end flows
  └── conftest.py          # Pytest fixtures
```

## Adding New Features

### To add a new API endpoint:
1. Create route in `backend/app/api/routes/{feature}.py`
2. Add to router in `backend/app/api/__init__.py`
3. Create corresponding frontend page/component

### To add a new agent:
1. Create `backend/app/agents/{agent_name}.py`
2. Add to orchestrator in `backend/app/agents/orchestrator.py`
3. Create route in `backend/app/api/routes/{agent_name}.py`

### To add a new page:
1. Create `frontend/src/pages/{page_name}.tsx`
2. Add route link in navigation
3. Call backend API endpoints as needed
