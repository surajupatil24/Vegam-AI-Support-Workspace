"""
Redmine API client wrapper - Handles all Redmine API interactions
"""

from typing import Dict, Any, List, Optional, Tuple
import httpx
import re
from html import unescape
from urllib.parse import urljoin
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

    def _build_auth_request_context(self) -> Tuple[Dict[str, str], Optional[tuple[str, str]]]:
        """Prepare request headers and optional auth tuple for Redmine API calls."""
        return self.headers.copy(), None

    @staticmethod
    def _extract_authenticity_token(html: str) -> Optional[str]:
        """Extract CSRF token from the Redmine login form."""
        patterns = (
            r'name="authenticity_token"\s+value="([^"]+)"',
            r'meta\s+name="csrf-token"\s+content="([^"]+)"',
        )

        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                return match.group(1)

        return None

    @staticmethod
    def _looks_like_login_page(html: str) -> bool:
        """Detect whether the fetched HTML is still the Redmine login form."""
        normalized = html or ""
        return 'action="/login"' in normalized and 'id="login-submit"' in normalized

    @staticmethod
    def _extract_input_value(html: str, element_id: str) -> Optional[str]:
        pattern = rf'id="{re.escape(element_id)}"[^>]*value="([^"]*)"'
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return unescape(match.group(1)).strip()
        return None

    @classmethod
    def _extract_user_from_account_page(cls, html: str, fallback_login: str) -> Dict[str, Any]:
        """Scrape user details from the authenticated Redmine account page."""
        login = cls._extract_input_value(html, "user_login") or fallback_login
        first_name = cls._extract_input_value(html, "user_firstname") or ""
        last_name = cls._extract_input_value(html, "user_lastname") or ""
        mail = cls._extract_input_value(html, "user_mail") or ""

        redmine_id: Optional[int] = None
        id_patterns = (
            r'window\.userId\s*=\s*[\'"](\d+)[\'"]',
            r'href="/users/(\d+)"',
            r'action="/users/(\d+)"',
        )

        for pattern in id_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                try:
                    redmine_id = int(match.group(1))
                except ValueError:
                    redmine_id = None
                break

        full_name = " ".join(part for part in (first_name, last_name) if part).strip()

        if not any([login, mail, full_name]):
            return {}

        return {
            "id": redmine_id,
            "login": login,
            "name": full_name or login or mail,
            "mail": mail or (login if "@" in login else ""),
        }

    async def _get_current_user_via_form_login(self) -> Dict[str, Any]:
        """Authenticate using Redmine's browser login form and reuse the session cookie."""
        if not self.username or not self.password:
            return {}

        login_url = f"{self.base_url}/login"
        current_user_url = f"{self.base_url}/users/current.json"

        try:
            async with httpx.AsyncClient(timeout=30.0, verify=False, follow_redirects=True) as client:
                login_page = await client.get(login_url)
                login_page.raise_for_status()

                authenticity_token = self._extract_authenticity_token(login_page.text)
                if not authenticity_token:
                    logger.warning("Could not extract Redmine authenticity token from login form")
                    return {}

                form_headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": login_url,
                }
                form_data = {
                    "utf8": "✓",
                    "authenticity_token": authenticity_token,
                    "username": self.username,
                    "password": self.password,
                    "login": "Login",
                }

                response = await client.post(login_url, data=form_data, headers=form_headers)
                response.raise_for_status()

                if self._looks_like_login_page(response.text) and "Invalid user or password" in response.text:
                    return {}

                try:
                    current_user_response = await client.get(
                        current_user_url,
                        headers={"Accept": "application/json"},
                    )
                    current_user_response.raise_for_status()
                    data = current_user_response.json()
                    user = data.get("user", {})
                    if user.get("id") or user.get("login") or user.get("mail"):
                        return user
                except httpx.HTTPError as exc:
                    logger.warning("Redmine JSON current-user lookup after form login failed: %s", exc)

                account_response = await client.get(f"{self.base_url}/my/account")
                account_response.raise_for_status()

                if self._looks_like_login_page(account_response.text):
                    return {}

                return self._extract_user_from_account_page(account_response.text, self.username)
        except httpx.HTTPError as exc:
            logger.error("Redmine form login failed: %s", exc)
            return {}
        except Exception as exc:
            logger.error("Unexpected error during Redmine form login: %s", exc)
            return {}

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
                headers, auth = self._build_auth_request_context()

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

    async def download_attachment(self, content_url: str) -> Tuple[bytes, Optional[str]]:
        """Download a Redmine attachment using the configured authentication context."""
        if not content_url:
            raise ValueError("Attachment URL is required")

        resolved_url = content_url
        if not resolved_url.startswith(("http://", "https://")):
            resolved_url = urljoin(f"{self.base_url}/", content_url.lstrip("/"))

        headers, auth = self._build_auth_request_context()
        async with httpx.AsyncClient(timeout=60.0, verify=False, follow_redirects=True) as client:
            response = await client.get(resolved_url, headers=headers, auth=auth)
            response.raise_for_status()
            return response.content, response.headers.get("content-type")

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

    async def get_user_issues(self, assigned_to_id: int, status: str = "open", limit: int = 100) -> List[Dict]:
        """Get issues assigned to a user"""
        status_lookup = {
            "open": "o",
            "closed": "c",
            "all": "*",
        }
        params = {
            "assigned_to_id": assigned_to_id,
            "status_id": status_lookup.get(status, status),
            "limit": limit,
            "sort": "id:desc",
        }

        url = f"{self.base_url}/issues.json"
        try:
            headers, auth = self._build_auth_request_context()

            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                response = await client.get(url, headers=headers, params=params, auth=auth)
                response.raise_for_status()
                data = response.json()
                return data.get("issues", [])
        except Exception as e:
            logger.error(f"Failed to get user issues: {e}")
            return []

    async def get_query_issues(self, query_id: int, limit: int = 100, sort: str = "assigned_to,id:desc") -> List[Dict]:
        """Get issues from a saved Redmine query, following pagination if needed."""
        url = f"{self.base_url}/issues.json"
        collected_issues: List[Dict] = []
        offset = 0

        try:
            headers, auth = self._build_auth_request_context()

            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                while True:
                    params = {
                        "query_id": query_id,
                        "limit": limit,
                        "offset": offset,
                        "sort": sort,
                    }
                    response = await client.get(url, headers=headers, params=params, auth=auth)
                    response.raise_for_status()
                    data = response.json()
                    issues = data.get("issues", [])
                    total_count = data.get("total_count", len(issues))

                    collected_issues.extend(issues)

                    if not issues or len(collected_issues) >= total_count:
                        break

                    offset += len(issues)

            return collected_issues
        except Exception as e:
            logger.error(f"Failed to get query issues for query_id={query_id}: {e}")
            return []

    async def get_projects(self, limit: int = 100) -> List[Dict]:
        """Get Redmine projects, following pagination until all projects are collected."""
        url = f"{self.base_url}/projects.json"
        collected_projects: List[Dict] = []
        offset = 0

        try:
            headers, auth = self._build_auth_request_context()

            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                while True:
                    params = {
                        "limit": limit,
                        "offset": offset,
                    }
                    response = await client.get(url, headers=headers, params=params, auth=auth)
                    response.raise_for_status()
                    data = response.json()
                    projects = data.get("projects", [])
                    total_count = data.get("total_count", len(projects))

                    collected_projects.extend(projects)

                    if not projects or len(collected_projects) >= total_count:
                        break

                    offset += len(projects)

            return collected_projects
        except Exception as e:
            logger.error(f"Failed to get Redmine projects: {e}")
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
        url = f"{self.base_url}/users/current.json"
        headers, auth = self._build_auth_request_context()

        try:
            async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
                response = await client.get(url, headers=headers, auth=auth)
                response.raise_for_status()
                data = response.json()
                user = data.get("user", {})
                if user.get("id"):
                    return user
        except Exception as exc:
            logger.warning("Primary Redmine current-user lookup failed: %s", exc)

        if self.username and self.password:
            return await self._get_current_user_via_form_login()

        return {}

    async def test_connection(self) -> bool:
        """Test Redmine connection"""
        try:
            user = await self.get_current_user()
            return bool(user.get("id"))
        except Exception as e:
            logger.error(f"Redmine connection test failed: {e}")
            return False
