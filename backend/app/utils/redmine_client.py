"""
Redmine API client wrapper - Handles all Redmine API interactions
"""

from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class RedmineClient:
    """Client for Redmine REST API"""

    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None, username: Optional[str] = None, password: Optional[str] = None):
        self.base_url = (base_url or settings.REDMINE_BASE_URL).rstrip('/')
        self.api_key = api_key or settings.REDMINE_API_KEY
        self.username = username
        self.password = password

        self.headers = {
            "Content-Type": "application/json"
        }

        # Use Basic Auth if username/password provided, otherwise use API key
        if username and password:
            import base64
            credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
            self.headers["Authorization"] = f"Basic {credentials}"
        else:
            self.headers["X-Redmine-API-Key"] = self.api_key

    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Make HTTP request to Redmine API"""
        url = f"{self.base_url}/issues/{endpoint}.json"

        try:
            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                # For Basic Auth, use auth parameter instead of headers
                auth = None
                headers = self.headers.copy()

                if "Authorization" in headers and headers["Authorization"].startswith("Basic"):
                    # Extract credentials from header and use auth parameter
                    auth_header = headers.pop("Authorization")
                    import base64
                    _, creds = auth_header.split(" ", 1)
                    decoded = base64.b64decode(creds).decode()
                    username, password = decoded.split(":", 1)
                    auth = (username, password)

                response = await client.request(
                    method,
                    url,
                    headers=headers,
                    auth=auth,
                    **kwargs
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Redmine API error: {e}")
            raise

    async def get_issue(self, issue_id: int) -> Dict[str, Any]:
        """
        Get issue details from Redmine

        Returns complete issue data including custom fields
        """
        data = await self._request("GET", str(issue_id), params={"include": "children,attachments,relations,changesets"})
        return data.get("issue", {})

    async def get_issue_comments(self, issue_id: int) -> List[Dict]:
        """Get all comments for an issue"""
        data = await self._request("GET", f"{issue_id}/comments")
        return data.get("comments", [])

    async def get_issue_attachments(self, issue_id: int) -> List[Dict]:
        """Get all attachments for an issue"""
        issue = await self.get_issue(issue_id)
        return issue.get("attachments", [])

    async def get_issue_watchers(self, issue_id: int) -> List[Dict]:
        """Get watchers for an issue"""
        try:
            url = f"{self.base_url}/issues/{issue_id}/watchers.json"
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                return data.get("watchers", [])
        except Exception as e:
            logger.error(f"Failed to get watchers: {e}")
            return []

    async def get_user_issues(self, assigned_to_id: int, status: str = "open") -> List[Dict]:
        """Get issues assigned to a user"""
        params = {
            "assigned_to_id": assigned_to_id,
            "status_id": "o" if status == "open" else "c",  # o=open, c=closed
            "limit": 100
        }

        url = f"{self.base_url}/issues.json"
        try:
            auth = None
            headers = self.headers.copy()

            # Handle Basic Auth
            if "Authorization" in headers and headers["Authorization"].startswith("Basic"):
                auth_header = headers.pop("Authorization")
                import base64
                _, creds = auth_header.split(" ", 1)
                decoded = base64.b64decode(creds).decode()
                username, password = decoded.split(":", 1)
                auth = (username, password)

            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                response = await client.get(url, headers=headers, params=params, auth=auth)
                response.raise_for_status()
                data = response.json()
                return data.get("issues", [])
        except Exception as e:
            logger.error(f"Failed to get user issues: {e}")
            return []

    async def update_issue(self, issue_id: int, data: Dict) -> bool:
        """
        ⚠️ DISABLED: WRITE OPERATION TO REDMINE

        This method is DISABLED to prevent accidental writes to Redmine.
        Until explicitly authorized, all Redmine operations are READ-ONLY.
        """
        raise NotImplementedError(
            "WRITE OPERATIONS TO REDMINE ARE DISABLED. "
            "This is a READ-ONLY system. "
            "Only read operations are allowed."
        )

    async def add_comment(self, issue_id: int, comment: str, is_private: bool = False) -> bool:
        """
        ⚠️ DISABLED: WRITE OPERATION TO REDMINE

        This method is DISABLED to prevent accidental writes to Redmine.
        Until explicitly authorized, all Redmine operations are READ-ONLY.
        """
        raise NotImplementedError(
            "WRITE OPERATIONS TO REDMINE ARE DISABLED. "
            "This is a READ-ONLY system. "
            "Only read operations are allowed."
        )

    async def close_issue(self, issue_id: int, notes: str, status_id: int = 5) -> bool:
        """
        ⚠️ DISABLED: WRITE OPERATION TO REDMINE

        This method is DISABLED to prevent accidental writes to Redmine.
        Until explicitly authorized, all Redmine operations are READ-ONLY.
        """
        raise NotImplementedError(
            "WRITE OPERATIONS TO REDMINE ARE DISABLED. "
            "This is a READ-ONLY system. "
            "Only read operations are allowed."
        )

    async def get_user(self, user_id: int) -> Dict[str, Any]:
        """Get user details"""
        try:
            url = f"{self.base_url}/users/{user_id}.json"
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                return data.get("user", {})
        except Exception as e:
            logger.error(f"Failed to get user: {e}")
            return {}

    async def get_current_user(self) -> Dict[str, Any]:
        """Get current authenticated user"""
        try:
            url = f"{self.base_url}/users/current.json"
            auth = None
            headers = self.headers.copy()

            # Handle Basic Auth
            if "Authorization" in headers and headers["Authorization"].startswith("Basic"):
                auth_header = headers.pop("Authorization")
                import base64
                _, creds = auth_header.split(" ", 1)
                decoded = base64.b64decode(creds).decode()
                username, password = decoded.split(":", 1)
                auth = (username, password)

            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                response = await client.get(url, headers=headers, auth=auth)
                response.raise_for_status()
                data = response.json()
                return data.get("user", {})
        except Exception as e:
            logger.error(f"Failed to get current user: {e}")
            return {}

    async def test_connection(self) -> bool:
        """Test Redmine connection"""
        try:
            user = await self.get_current_user()
            return bool(user.get("id"))
        except Exception as e:
            logger.error(f"Redmine connection test failed: {e}")
            return False

    async def get_projects(self) -> List[Dict]:
        """Get all projects"""
        try:
            url = f"{self.base_url}/projects.json"
            auth = None
            headers = self.headers.copy()

            # Handle Basic Auth
            if "Authorization" in headers and headers["Authorization"].startswith("Basic"):
                auth_header = headers.pop("Authorization")
                import base64
                _, creds = auth_header.split(" ", 1)
                decoded = base64.b64decode(creds).decode()
                username, password = decoded.split(":", 1)
                auth = (username, password)

            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                response = await client.get(url, headers=headers, params={"limit": 100}, auth=auth)
                response.raise_for_status()
                data = response.json()
                return data.get("projects", [])
        except Exception as e:
            logger.error(f"Failed to get projects: {e}")
            return []
