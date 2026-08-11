from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from app.db.database import get_db
from app.db.models import Ticket, Investigation, KnowledgeBase
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class KnowledgeAgentRequest(BaseModel):
    ticket_id: int


class SimilarTicketResult(BaseModel):
    ticket_id: int
    title: str
    status: str
    common_theme: str
    confidence: float


class KnowledgeAgentResponse(BaseModel):
    ticket_id: int
    similar_tickets: list[SimilarTicketResult]
    total_found: int
    status: str


def extract_keywords(text: str) -> list[str]:
    """Extract keywords from text for similarity search"""
    if not text:
        return []
    words = text.lower().split()
    # Filter out common words
    stopwords = {"the", "a", "an", "and", "or", "is", "are", "in", "on", "at", "to", "for", "of"}
    return [w for w in words if w not in stopwords and len(w) > 3]


def calculate_similarity(keywords1: list[str], keywords2: list[str]) -> float:
    """Calculate Jaccard similarity between two keyword lists"""
    if not keywords1 or not keywords2:
        return 0.0
    set1 = set(keywords1)
    set2 = set(keywords2)
    if not set1 or not set2:
        return 0.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0


@router.post("/search")
async def search_knowledge_base(
    request: KnowledgeAgentRequest,
    db: Session = Depends(get_db)
):
    """
    Knowledge Agent: Search similar tickets and solutions

    Searches for:
    - Similar tickets in the database
    - Previous investigations with similar root causes
    - Common themes and patterns

    Uses keyword-based similarity search
    """
    try:
        # Get the current ticket
        ticket = db.query(Ticket).filter(Ticket.redmine_id == request.ticket_id).first()

        if not ticket:
            return KnowledgeAgentResponse(
                ticket_id=request.ticket_id,
                similar_tickets=[],
                total_found=0,
                status="ticket_not_found"
            )

        # Extract keywords from current ticket
        ticket_keywords = extract_keywords(ticket.subject + " " + (ticket.description or ""))

        # Search for similar tickets in completed investigations
        similar_results = []

        # Query all other tickets with investigations
        investigations = db.query(
            Ticket.redmine_id,
            Ticket.subject,
            Ticket.status,
            Investigation.root_cause,
            Investigation.ai_was_correct
        ).join(
            Investigation, Ticket.id == Investigation.ticket_id
        ).filter(
            Ticket.redmine_id != request.ticket_id,
            Investigation.status == "completed"
        ).all()

        for inv in investigations:
            # Calculate similarity based on description keywords
            inv_keywords = extract_keywords(inv.subject + " " + (inv.root_cause or ""))
            similarity = calculate_similarity(ticket_keywords, inv_keywords)

            if similarity > 0.2:  # Only include if > 20% similar
                similar_results.append({
                    "ticket_id": inv.redmine_id,
                    "title": inv.subject,
                    "status": inv.status,
                    "common_theme": inv.root_cause[:100] if inv.root_cause else "Unknown",
                    "confidence": round(similarity, 2),
                    "was_correct": inv.ai_was_correct
                })

        # Also search knowledge base entries
        kb_entries = db.query(KnowledgeBase).filter(
            KnowledgeBase.issue_summary != None
        ).all()

        for entry in kb_entries:
            entry_keywords = extract_keywords(entry.issue_summary + " " + (entry.solution or ""))
            similarity = calculate_similarity(ticket_keywords, entry_keywords)

            if similarity > 0.15:  # Lower threshold for KB entries
                similar_results.append({
                    "ticket_id": entry.ticket_id,
                    "title": entry.issue_summary[:80],
                    "status": "resolved",
                    "common_theme": entry.solution[:100] if entry.solution else "Unknown",
                    "confidence": round(similarity, 2),
                    "was_correct": True
                })

        # Sort by confidence (descending) and deduplicate
        unique_results = {}
        for result in similar_results:
            key = result["ticket_id"]
            if key not in unique_results or result["confidence"] > unique_results[key]["confidence"]:
                unique_results[key] = result

        sorted_results = sorted(
            unique_results.values(),
            key=lambda x: x["confidence"],
            reverse=True
        )[:5]  # Return top 5 most similar

        # Format results
        formatted_results = [
            SimilarTicketResult(
                ticket_id=r["ticket_id"],
                title=r["title"],
                status=r["status"],
                common_theme=r["common_theme"],
                confidence=r["confidence"]
            )
            for r in sorted_results
        ]

        return KnowledgeAgentResponse(
            ticket_id=request.ticket_id,
            similar_tickets=formatted_results,
            total_found=len(formatted_results),
            status="completed"
        )

    except Exception as e:
        logger.error(f"Knowledge agent search failed: {e}")
        return KnowledgeAgentResponse(
            ticket_id=request.ticket_id,
            similar_tickets=[],
            total_found=0,
            status="error"
        )
