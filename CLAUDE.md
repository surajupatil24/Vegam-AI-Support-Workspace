# Samixa AI Support Assistant
**Internal AI Operating System for Vegam Support Team**

## Project Vision

Develop an AI-powered support platform that acts as the brain of the entire support team. Instead of every engineer solving problems independently, the system learns from every ticket, investigation, conversation, and resolution to become a centralized AI knowledge base.

### Goals
- Reduce investigation time
- Improve first-time resolution
- Preserve team knowledge forever
- Help new engineers become productive quickly
- Assist Team Leads in monitoring support quality
- Eventually become the company's internal AI expert

---

## Architecture Overview

### 5 Core AI Agents

1. **Redmine Agent** — Extracts complete ticket information (subject, description, comments, attachments, history)
2. **Knowledge Agent** — Searches similar tickets, errors, investigations, solutions, and previous AI conversations
3. **Code Agent** — Analyzes repositories, finds related modules, services, APIs, SQL, classes, controllers, bugs (when code-related)
4. **AI Analysis Agent** — Uses ChatGPT/Claude to generate root cause, investigation steps, possible fixes, risks, and confidence
5. **Communication Agent** — Generates client replies, Redmine updates, closure comments, and internal notes

### Knowledge Base
- Every investigation stored permanently
- Tickets, AI conversations, human conversations, solutions, root causes, engineers, time taken, screenshots, attachments
- Retention: Forever (10+ year memory)

---

## User Flows

### Support Engineer

```
Login (Redmine credentials) 
→ Home Dashboard (assigned tickets)
→ Select Ticket 
→ Start Investigation (auto-runs all 5 agents)
→ View AI Investigation Workspace
→ Review findings and AI analysis
→ Copy suggested responses to Redmine
→ System learns from resolution
```

### Team Lead
- View team performance, AI metrics, SLA status
- Review all AI conversations and recommendations
- Track AI accuracy and team adoption
- Identify repeated issues

---

## Technology Stack

**Frontend:** React, Next.js, Tailwind CSS, ShadCN UI
**Backend:** FastAPI (Python)
**Database:** PostgreSQL
**Vector DB:** pgvector or Qdrant
**AI Orchestration:** LangGraph or CrewAI
**Code Search:** Git integration + embeddings
**AI Providers:** OpenAI, Claude, Gemini, Azure OpenAI, OpenRouter
**Authentication:** Redmine SSO/Login integration

---

## UI Screens (Priority)

1. **Enterprise Login** — Redmine authentication
2. **Home Dashboard** — Horizontal ticket cards, KPIs, recent activity
3. **AI Investigation Workspace** — 3-column layout (tickets | investigation | evidence)
4. **Administration Panel** — User, AI provider, Redmine, repository, knowledge base config
5. **Team Lead Dashboard** — Analytics, performance, AI adoption metrics

---

## Design Direction

Premium enterprise SaaS style (Linear, Notion AI, GitHub Copilot Workspace, Atlassian Jira Cloud)
- Clean light theme with blue accents
- Rounded cards, subtle shadows
- Modern typography
- Professional SaaS interface

---

## ChatGPT Discussion
Reference: https://chatgpt.com/share/6a776f19-6ef0-83ee-8546-22ef422cf9e0

