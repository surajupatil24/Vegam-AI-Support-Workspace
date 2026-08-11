# Samixa Architecture Overview

## 🏗️ High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER LAYER                               │
│                                                                   │
│  ┌──────────────────┐     ┌──────────────────┐                   │
│  │   WEB BROWSER    │────▶│  Next.js Frontend│                   │
│  │   (React UI)     │     │   (Port 3000)    │                   │
│  └──────────────────┘     └────────┬─────────┘                   │
│                                     │                             │
└─────────────────────────────────────┼─────────────────────────────┘
                                      │ HTTP/REST
                    ┌─────────────────▼────────────────┐
                    │   API GATEWAY / CORS             │
                    └─────────────────┬────────────────┘
                                      │
┌─────────────────────────────────────┼─────────────────────────────┐
│                    APPLICATION LAYER                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              FastAPI Backend (Port 8000)               │   │
│  │                                                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │  Auth Routes │  │ Ticket Routes│  │Agent Routes │ │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────────┐│   │
│  │  │           AGENT ORCHESTRATION LAYER              ││   │
│  │  │                                                  ││   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ││   │
│  │  │  │ Redmine  │  │Knowledge │  │Code Analysis│  ││   │
│  │  │  │  Agent   │  │  Agent   │  │   Agent     │  ││   │
│  │  │  └──────────┘  └──────────┘  └──────────────┘  ││   │
│  │  │                                                 ││   │
│  │  │  ┌──────────────────┐  ┌─────────────────┐    ││   │
│  │  │  │   AI Analysis    │  │ Communication   │    ││   │
│  │  │  │     Agent        │  │   Agent         │    ││   │
│  │  │  └──────────────────┘  └─────────────────┘    ││   │
│  │  │                                               ││   │
│  │  └──────────────────────────────────────────────┘│   │
│  │                                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────┐
    │ PostgreSQL  │  │   Redmine    │  │  OpenAI  │
    │  + pgvector │  │     API      │  │ / Claude │
    │  (Port 5432)│  │              │  │   APIs   │
    └─────────────┘  └──────────────┘  └──────────┘
```

---

## 📊 Data Flow Diagram

### Investigation Workflow

```
User clicks "Start Investigation"
        │
        ▼
┌──────────────────────────────┐
│ 1. REDMINE AGENT             │
│ ├─ Fetch ticket from Redmine │
│ ├─ Extract comments          │
│ ├─ Get attachments           │
│ └─ Cache in database         │
└──────────────────┬───────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│ 2A. KNOWLEDGE    │  │ 2B. CODE AGENT   │
│ AGENT            │  │ ├─ Clone repo    │
│ ├─ Vector search │  │ ├─ Parse code    │
│ ├─ Find similar  │  │ ├─ Find refs     │
│ └─ Match tickets │  │ └─ Detect bugs   │
└────────┬─────────┘  └──────────┬───────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
          ┌────────────────────┐
          │ 3. AI ANALYSIS     │
          │ ├─ OpenAI/Claude   │
          │ ├─ Root cause      │
          │ ├─ Fix options     │
          │ └─ Confidence      │
          └────────┬───────────┘
                   │
                   ▼
          ┌────────────────────┐
          │ 4. COMMUNICATION   │
          │ ├─ Client reply    │
          │ ├─ Redmine comment │
          │ ├─ Closure notes   │
          │ └─ Internal docs   │
          └────────┬───────────┘
                   │
                   ▼
          ┌────────────────────┐
          │ 5. KNOWLEDGE STORE │
          │ ├─ Vector embedding│
          │ ├─ Solution save   │
          │ └─ Confidence      │
          └────────┬───────────┘
                   │
                   ▼
          "Next similar ticket
           becomes easier!"
```

---

## 🗂️ File Organization

```
Backend
├── Authentication
│   ├── app/utils/auth.py          ← JWT token management
│   └── app/api/routes/auth.py     ← Login endpoint
│
├── Redmine Integration
│   ├── app/utils/redmine_client.py ← Redmine API wrapper
│   ├── app/agents/redmine_agent.py ← Ticket extraction
│   └── app/api/routes/redmine_agent.py ← Extract endpoint
│
├── Agents (AI Workers)
│   ├── app/agents/knowledge_agent.py    ← Vector search
│   ├── app/agents/code_agent.py         ← Code analysis
│   ├── app/agents/ai_analysis_agent.py  ← LLM analysis
│   ├── app/agents/communication_agent.py ← Response gen
│   └── app/agents/orchestrator.py       ← Coordinator
│
├── Data Layer
│   ├── app/db/models.py           ← SQLAlchemy models
│   ├── app/db/database.py         ← DB connection
│   └── migrations/versions/       ← Schema versions
│
└── API Routes
    └── app/api/routes/
        ├── auth.py
        ├── tickets.py
        ├── investigations.py
        ├── redmine_agent.py
        ├── knowledge_agent.py
        ├── code_agent.py
        ├── ai_analysis_agent.py
        ├── communication_agent.py
        ├── admin.py
        └── team_lead.py

Frontend
├── Pages
│   ├── pages/index.tsx           ← Redirect logic
│   ├── pages/login.tsx           ← Login form
│   └── pages/dashboard.tsx       ← Main dashboard
│
├── Components
│   └── components/               ← Reusable React components
│
├── State Management
│   ├── lib/store.ts              ← Zustand auth store
│   └── lib/api.ts                ← Axios API client
│
└── Styling
    └── styles/globals.css        ← Tailwind styles
```

---

## 🔌 External Integrations

```
┌─────────────────┐
│  Samixa System  │
├─────────────────┤
│                 │
├─ Redmine API   │─────▶ Redmine Instance
│  (User login,   │      (Extract tickets)
│   ticket data)  │
│                 │
├─ OpenAI API    │─────▶ ChatGPT-4
│  (Analysis,     │      (Root cause analysis)
│   reasoning)    │
│                 │
├─ Anthropic API │─────▶ Claude
│  (Analysis,     │      (Detailed explanations)
│   insights)     │
│                 │
├─ Gemini API    │─────▶ Google Gemini
│  (Code review,  │      (Alternative analysis)
│   refactoring)  │
│                 │
└─────────────────┘
```

---

## 📦 Component Interaction

### Authentication Flow

```
User
  │
  ├─ Enters username/password
  │
  ▼
Login Page (Frontend)
  │
  ├─ POST /api/auth/login
  │
  ▼
Auth Route (Backend)
  │
  ├─ Validate credentials against Redmine
  │
  ▼
Redmine API
  │
  ├─ Returns user info
  │
  ▼
Auth Service
  │
  ├─ Create JWT token
  ├─ Store/update user in database
  │
  ▼
Response with Token
  │
  ├─ Sent to frontend
  │
  ▼
Frontend Storage
  │
  ├─ Store token in localStorage
  ├─ Set Authorization header for future requests
  │
  ▼
Protected Routes
  ├─ All future requests include token
  └─ Backend verifies token
```

### Investigation Flow

```
User selects ticket
  │
  ▼
Frontend: "Start Investigation"
  │
  ├─ POST /api/investigations/start
  │
  ▼
Backend: Create Investigation Record
  │
  ├─ Create entry in investigations table
  │
  ▼
Agent Orchestrator
  │
  ├─ Start Redmine Agent
  │   ├─ Fetch ticket from Redmine
  │   ├─ Cache in database
  │   └─ Return ticket data
  │
  ├─ Start Knowledge Agent (parallel)
  │   ├─ Generate vector embedding
  │   ├─ Search pgvector
  │   ├─ Find similar tickets
  │   └─ Return matches
  │
  ├─ Start Code Agent (parallel)
  │   ├─ Clone repository
  │   ├─ Parse code structure
  │   ├─ Identify references
  │   └─ Return code analysis
  │
  ├─ Start AI Analysis Agent
  │   ├─ Combine all inputs
  │   ├─ Call OpenAI/Claude
  │   ├─ Parse response
  │   └─ Return analysis
  │
  ├─ Start Communication Agent
  │   ├─ Generate client reply
  │   ├─ Create Redmine comment
  │   ├─ Write closure notes
  │   └─ Return messages
  │
  └─ Store Investigation Results
     ├─ Update investigation record
     ├─ Store in knowledge base
     └─ Update confidence scores

Frontend polls /api/investigations/{id}/progress
  │
  ├─ Real-time progress display
  │
  ▼
User sees results
  │
  ├─ View investigation report
  ├─ Copy responses
  ├─ Post to Redmine
  │
  ▼
User marks ticket resolved
  │
  ├─ Rate AI accuracy
  │
  ▼
System learns
  ├─ Update knowledge base
  ├─ Adjust confidence scores
  └─ Improve for next ticket
```

---

## 🗄️ Database Schema

```
users
├─ id (PK)
├─ username (unique)
├─ email (unique)
├─ full_name
├─ redmine_id
├─ role (engineer, lead, admin)
└─ is_active

tickets
├─ id (PK)
├─ redmine_id (unique)
├─ subject
├─ description
├─ tracker
├─ priority
├─ status
├─ module
├─ customer
├─ assigned_to (FK)
└─ created_at, updated_at, closed_at

investigations
├─ id (PK)
├─ ticket_id (FK)
├─ engineer_id (FK)
├─ status (in_progress, completed, pending)
├─ redmine_data (JSON)
├─ similar_tickets (JSON)
├─ code_analysis (JSON)
├─ ai_analysis (JSON)
├─ root_cause
├─ investigation_steps
├─ recommended_fix
├─ confidence_score
├─ risks
├─ client_reply
├─ redmine_comment
├─ closure_notes
├─ ai_was_correct
├─ actual_solution
├─ created_at, completed_at, time_taken_minutes

ticket_comments
├─ id (PK)
├─ ticket_id (FK)
├─ redmine_comment_id (unique)
├─ author
├─ content
└─ created_at

knowledge_base
├─ id (PK)
├─ investigation_id (FK)
├─ ticket_id (FK)
├─ issue_summary
├─ root_cause
├─ solution
├─ keywords
├─ embedding (vector)
├─ engineer
├─ modules_involved
├─ confidence
└─ created_at, updated_at

ai_providers
├─ id (PK)
├─ name (unique)
├─ api_key
├─ base_url
├─ is_active
├─ priority
├─ is_default
└─ created_at, updated_at

system_config
├─ id (PK)
├─ config_key (unique)
├─ config_value
├─ description
└─ created_at, updated_at
```

---

## 🔐 Security Architecture

```
┌─────────────────────────────────────┐
│     External User (Browser)         │
└────────────────┬────────────────────┘
                 │
    ┌────────────▼────────────┐
    │  Frontend (Next.js)     │
    │  ├─ Input validation    │
    │  ├─ HTTPS only          │
    │  └─ Token management    │
    └────────────┬────────────┘
                 │ JWT Token in Authorization header
    ┌────────────▼────────────┐
    │  CORS Middleware        │
    │  ├─ Whitelist origins   │
    │  └─ Verify credentials  │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │  Auth Middleware        │
    │  ├─ Extract JWT         │
    │  ├─ Verify signature    │
    │  └─ Check expiration    │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │  Role-Based Access      │
    │  ├─ Engineer            │
    │  ├─ Lead                │
    │  └─ Admin               │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │  Route Handlers         │
    │  ├─ Input validation    │
    │  ├─ Business logic      │
    │  └─ Error handling      │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │  Database (PostgreSQL)  │
    │  ├─ Parameterized SQL   │
    │  ├─ Encrypted fields    │
    │  └─ Access logs         │
    └─────────────────────────┘
```

---

## 📈 Scaling Architecture

```
Current (Single Server)
┌──────────────────┐
│  Frontend        │
│  Backend         │
│  Database        │
└──────────────────┘

Production (Scalable)
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │     │  Frontend    │     │  Frontend    │
│  Instance 1  │     │  Instance 2  │     │  Instance N  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────┬───────┴────────────┬───────┘
                    │                    │
            ┌───────▼──────────┬─────────▼──────┐
            │   Load Balancer  │                │
            └────────┬─────────┘                │
                     │                         │
       ┌─────────────▼──────────────┐          │
       │                            │          │
    ┌──▼──┐    ┌──────┐    ┌──────┐│          │
    │Back-│    │Back- │    │Back- ││          │
    │end 1│    │end 2 │    │end N ││          │
    └──┬──┘    └───┬──┘    └───┬──┘│          │
       │           │           │   │          │
       │      ┌────▼───────────▼─┐ │          │
       │      │ Message Queue    │ │          │
       │      │ (Redis/RabbitMQ) │ │          │
       │      └────┬─────────────┘ │          │
       │           │               │          │
       └───────────┼───────────────┘          │
                   │                         │
       ┌───────────▼──────────────┐          │
       │   Cache Layer (Redis)    │          │
       └───────────┬──────────────┘          │
                   │                        │
    ┌──────────────▼──────────────┐          │
    │   Database Cluster          │──────────┘
    │   ├─ Primary (Write)        │
    │   ├─ Replicas (Read)        │
    │   └─ Vector DB (pgvector)   │
    └─────────────────────────────┘
```

---

## 🚀 Deployment Architecture

```
┌──────────────────────────────────────────────┐
│         Samixa Deployment Stack              │
├──────────────────────────────────────────────┤
│                                              │
│  Container Registry (Docker Hub/ECR)         │
│  └─ Backend image                            │
│  └─ Frontend image                           │
│                                              │
│  Kubernetes Cluster (or Docker Swarm)        │
│  ├─ Backend Pods (replicas)                  │
│  ├─ Frontend Pods (replicas)                 │
│  ├─ Database StatefulSet                     │
│  ├─ Redis Cache                              │
│  ├─ Vector DB (Qdrant)                       │
│  └─ Load Balancer                            │
│                                              │
│  Monitoring & Logging                        │
│  ├─ Prometheus (metrics)                     │
│  ├─ ELK Stack (logs)                         │
│  ├─ Jaeger (tracing)                         │
│  └─ Alerting (PagerDuty)                     │
│                                              │
│  CI/CD Pipeline                              │
│  ├─ GitHub Actions                           │
│  ├─ Build & Test                             │
│  ├─ Security Scanning                        │
│  ├─ Push to Registry                         │
│  └─ Deploy to Kubernetes                     │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 📊 Current Implementation Status

### What's Built ✅
```
┌─────────────────────────────────────┐
│ Authentication & Redmine Integration│ ✅ DONE
├─────────────────────────────────────┤
│ Database Models & Migrations        │ ✅ DONE
├─────────────────────────────────────┤
│ Redmine Agent Implementation        │ ✅ DONE
├─────────────────────────────────────┤
│ API Routes (Tickets, Auth)          │ ✅ DONE
├─────────────────────────────────────┤
│ Frontend Shell (Login, Dashboard)   │ ✅ DONE
├─────────────────────────────────────┤
│ Docker Setup & Configuration        │ ✅ DONE
└─────────────────────────────────────┘
```

### What's Ready to Implement 🔄
```
┌─────────────────────────────────────┐
│ Knowledge Agent (Vector Search)     │ 🔄 READY
├─────────────────────────────────────┤
│ Code Agent (Repository Analysis)    │ 🔄 READY
├─────────────────────────────────────┤
│ AI Analysis Agent (LLM Integration) │ 🔄 READY
├─────────────────────────────────────┤
│ Communication Agent (Response Gen)  │ 🔄 READY
├─────────────────────────────────────┤
│ Investigation Workspace UI          │ 🔄 READY
├─────────────────────────────────────┤
│ Admin & Team Lead Dashboards        │ 🔄 READY
└─────────────────────────────────────┘
```

---

**Foundation is solid. Ready to build the agents! 🎯**
