from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, index=True)
    email = Column(String(255), unique=True, index=True)
    full_name = Column(String(255))
    redmine_id = Column(Integer)
    is_active = Column(Boolean, default=True)
    role = Column(String(50), default="engineer")  # engineer, lead, admin
    created_at = Column(DateTime, default=datetime.utcnow)

    tickets = relationship("Ticket", back_populates="assignee")
    investigations = relationship("Investigation", back_populates="engineer")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    redmine_id = Column(Integer, unique=True, index=True)
    subject = Column(String(500))
    description = Column(Text)
    tracker = Column(String(100))
    priority = Column(String(50))
    status = Column(String(50))
    module = Column(String(255))
    customer = Column(String(255))
    assigned_to = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    assignee = relationship("User", back_populates="tickets")
    investigations = relationship("Investigation", back_populates="ticket")
    comments = relationship("TicketComment", back_populates="ticket")


class Investigation(Base):
    __tablename__ = "investigations"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    engineer_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String(50), default="in_progress")  # in_progress, completed, pending

    # Agent Results
    redmine_data = Column(JSON)  # Full ticket data from Redmine Agent
    similar_tickets = Column(JSON)  # Results from Knowledge Agent
    code_analysis = Column(JSON)  # Results from Code Agent
    ai_analysis = Column(JSON)  # Results from AI Analysis Agent (ChatGPT/Claude)

    root_cause = Column(Text)
    investigation_steps = Column(Text)
    recommended_fix = Column(Text)
    confidence_score = Column(Float, default=0.0)
    risks = Column(Text)

    # Generated Outputs
    client_reply = Column(Text)
    redmine_comment = Column(Text)
    closure_notes = Column(Text)

    # Feedback
    ai_was_correct = Column(Boolean, nullable=True)  # Did human confirm AI was correct?
    actual_solution = Column(Text, nullable=True)  # If AI was wrong, what was the actual solution?

    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    time_taken_minutes = Column(Integer, nullable=True)

    ticket = relationship("Ticket", back_populates="investigations")
    engineer = relationship("User", back_populates="investigations")


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    redmine_comment_id = Column(Integer, unique=True, index=True)
    author = Column(String(255))
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="comments")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    id = Column(Integer, primary_key=True, index=True)
    investigation_id = Column(Integer, ForeignKey("investigations.id"))
    ticket_id = Column(Integer, ForeignKey("tickets.id"))

    # Searchable Content
    issue_summary = Column(Text)
    root_cause = Column(Text)
    solution = Column(Text)
    keywords = Column(String(1000))

    # Embedding for vector search
    embedding = Column(String(10000))  # Will store pgvector data

    # Metadata
    engineer = Column(String(255))
    modules_involved = Column(String(500))
    confidence = Column(Float)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIProvider(Base):
    __tablename__ = "ai_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True)  # openai, claude, gemini, azure_openai, openrouter
    api_key = Column(String(500))
    base_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=0)  # Higher number = higher priority
    is_default = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(255), unique=True, index=True)
    config_value = Column(Text)
    description = Column(String(500))

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
