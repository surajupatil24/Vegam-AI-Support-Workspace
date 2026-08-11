"""
Redmine Agent - Extracts complete ticket information from Redmine

Responsibilities:
- Read complete ticket information from Redmine
- Extract: subject, description, comments, attachments, customer, module, priority, tracker, history
"""

from typing import Dict, Any
from app.utils.redmine_client import RedmineClient
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class RedmineAgent:
    """Agent for extracting ticket information from Redmine"""

    def __init__(self):
        self.redmine = RedmineClient()

    async def extract_ticket(self, ticket_id: int) -> Dict[str, Any]:
        """Extract complete ticket information from Redmine"""
        try:
            ticket = await self.redmine.get_issue(ticket_id)
            if not ticket:
                logger.error(f"Ticket {ticket_id} not found")
                return None

            return {
                "ticket_id": ticket.get("id"),
                "redmine_id": ticket.get("id"),
                "subject": ticket.get("subject"),
                "description": ticket.get("description"),
                "tracker": ticket.get("tracker", {}).get("name"),
                "priority": ticket.get("priority", {}).get("name"),
                "status": ticket.get("status", {}).get("name"),
                "module": self._extract_module(ticket),
                "customer": self._extract_customer(ticket),
                "assigned_to": ticket.get("assigned_to", {}).get("name"),
                "author": ticket.get("author", {}).get("name"),
                "created_on": ticket.get("created_on"),
                "updated_on": ticket.get("updated_on"),
                "custom_fields": ticket.get("custom_fields", []),
            }
        except Exception as e:
            logger.error(f"Failed to extract ticket {ticket_id}: {e}")
            return None

    async def get_ticket_comments(self, ticket_id: int) -> list:
        """Get all comments on a ticket"""
        try:
            comments = await self.redmine.get_issue_comments(ticket_id)
            return [
                {
                    "id": c.get("id"),
                    "author": c.get("author", {}).get("name"),
                    "content": c.get("notes"),
                    "created_on": c.get("created_on"),
                    "updated_on": c.get("updated_on"),
                }
                for c in comments
            ]
        except Exception as e:
            logger.error(f"Failed to get comments for ticket {ticket_id}: {e}")
            return []

    async def get_ticket_attachments(self, ticket_id: int) -> list:
        """Get all attachments on a ticket"""
        try:
            attachments = await self.redmine.get_issue_attachments(ticket_id)
            return [
                {
                    "id": a.get("id"),
                    "filename": a.get("filename"),
                    "filesize": a.get("filesize"),
                    "content_type": a.get("content_type"),
                    "description": a.get("description"),
                    "author": a.get("author", {}).get("name"),
                    "created_on": a.get("created_on"),
                    "download_url": a.get("download_url"),
                }
                for a in attachments
            ]
        except Exception as e:
            logger.error(f"Failed to get attachments for ticket {ticket_id}: {e}")
            return []

    async def get_ticket_watchers(self, ticket_id: int) -> list:
        """Get watchers for a ticket"""
        try:
            watchers = await self.redmine.get_issue_watchers(ticket_id)
            return [
                {
                    "id": w.get("id"),
                    "name": w.get("name"),
                    "mail": w.get("mail"),
                }
                for w in watchers
            ]
        except Exception as e:
            logger.error(f"Failed to get watchers for ticket {ticket_id}: {e}")
            return []

    def _extract_module(self, ticket: Dict[str, Any]) -> str:
        """Extract module/category from custom fields"""
        custom_fields = ticket.get("custom_fields", [])
        for field in custom_fields:
            if field.get("name", "").lower() in ["module", "category", "component"]:
                return field.get("value")
        return ""

    def _extract_customer(self, ticket: Dict[str, Any]) -> str:
        """Extract customer from custom fields or project"""
        custom_fields = ticket.get("custom_fields", [])
        for field in custom_fields:
            if field.get("name", "").lower() in ["customer", "company", "client"]:
                return field.get("value")
        return ticket.get("project", {}).get("name", "")

    async def process(self, ticket_id: int) -> Dict[str, Any]:
        """
        Main method: Extract all ticket information at once

        Returns:
            Complete ticket data with comments, attachments, watchers
        """
        logger.info(f"Processing ticket {ticket_id}")

        try:
            # Extract basic ticket info
            ticket_data = await self.extract_ticket(ticket_id)
            if not ticket_data:
                return {"error": f"Failed to extract ticket {ticket_id}"}

            # Get additional data in parallel
            comments = await self.get_ticket_comments(ticket_id)
            attachments = await self.get_ticket_attachments(ticket_id)
            watchers = await self.get_ticket_watchers(ticket_id)

            # Combine all data
            result = {
                **ticket_data,
                "comments": comments,
                "attachments": attachments,
                "watchers": watchers,
                "processed_at": datetime.utcnow().isoformat(),
                "status": "success"
            }

            logger.info(f"Successfully processed ticket {ticket_id}")
            return result

        except Exception as e:
            logger.error(f"Error processing ticket {ticket_id}: {e}")
            return {
                "ticket_id": ticket_id,
                "error": str(e),
                "status": "failed"
            }
