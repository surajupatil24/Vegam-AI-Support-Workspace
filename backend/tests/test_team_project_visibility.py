import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.routes.team_lead import get_team_ticket_rows
from app.utils.redmine_client import RedmineClient


class TeamProjectVisibilityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.viewer = SimpleNamespace(id=1, full_name="Viewer", username="viewer",
                                      email="viewer@example.com", redmine_id=678)
        self.project = {"id": 17, "name": "Henkel Snow Tracker Tickets"}
        self.client = SimpleNamespace(get_projects=AsyncMock(return_value=[self.project]),
                                      get_project_issues=AsyncMock(return_value=[]))

    async def rows(self, selection):
        with patch("app.api.routes.team_lead.RedmineClient", return_value=self.client), \
             patch("app.api.routes.team_lead.read_redmine_project_selection", return_value=selection):
            return await get_team_ticket_rows(self.viewer, None)

    async def test_enabled_henkel_groups_all_statuses_and_trackers_by_assignee(self):
        assigned = {"id": 678, "name": "Aman Jamal"}
        self.client.get_project_issues.return_value = [
            {"id": 1, "project": self.project, "assigned_to": assigned,
             "status": {"name": "New"}, "priority": {"name": "High"}},
            {"id": 2, "project": self.project, "assigned_to": assigned,
             "status": {"name": "Closed"}, "tracker": {"name": "Change Request"}},
            {"id": 3, "project": self.project},
            {"id": 1, "project": self.project, "assigned_to": assigned},
            {"id": 4, "project": {"id": 18, "name": "Disabled"}},
        ]
        result = await self.rows({"configured": True, "enabled_project_ids": {17}})
        self.client.get_project_issues.assert_awaited_once_with(17)
        self.client.get_projects.assert_not_awaited()
        self.assertEqual(result["total_tickets"], 3)
        self.assertEqual(result["total_members"], 2)
        self.assertEqual(result["team_members"][0]["ticket_count"], 2)
        self.assertEqual(result["team_members"][0]["redmine_assignee_id"], 678)
        self.assertEqual(result["team_members"][1]["display_name"], "Unassigned")
        self.assertEqual(result["pending_tickets"], 1)
        self.assertEqual(result["critical_tickets"], 1)

    async def test_clear_all_does_not_restore_default_projects(self):
        result = await self.rows({"configured": True, "enabled_project_ids": set()})
        self.assertEqual(result["total_tickets"], 0)
        self.client.get_projects.assert_not_awaited()
        self.client.get_project_issues.assert_not_awaited()

    async def test_legacy_name_selection_resolves_project_ids(self):
        await self.rows({"configured": True, "enabled_project_names": {"henkel snow tracker tickets"}})
        self.client.get_project_issues.assert_awaited_once_with(17)

    async def test_default_selection_uses_existing_default_project_rules(self):
        self.client.get_projects.return_value.append({"id": 19, "name": "Surventis India"})
        await self.rows({"configured": False})
        self.client.get_project_issues.assert_awaited_once_with(19)

    async def test_failure_does_not_return_partial_ticket_counts(self):
        self.client.get_project_issues.side_effect = [[], RuntimeError("Offline")]
        with self.assertLogs("app.api.routes.team_lead", level="ERROR"):
            with self.assertRaises(HTTPException) as raised:
                await self.rows({"configured": True, "enabled_project_ids": {17, 18}})
        self.assertEqual(raised.exception.status_code, 502)

    async def test_project_pagination_uses_all_statuses_without_query_filters(self):
        responses = [SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"issues": [{"id": 1}], "total_count": 2}),
                     SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"issues": [{"id": 2}], "total_count": 2})]
        http = AsyncMock()
        http.get.side_effect = responses
        context = AsyncMock()
        context.__aenter__.return_value = http
        with patch("app.utils.redmine_client.httpx.AsyncClient", return_value=context):
            issues = await RedmineClient().get_project_issues(17)
        self.assertEqual([issue["id"] for issue in issues], [1, 2])
        params = [call.kwargs["params"] for call in http.get.await_args_list]
        self.assertEqual([p["offset"] for p in params], [0, 1])
        self.assertTrue(all(p["status_id"] == "*" and p["project_id"] == 17 and "query_id" not in p for p in params))


if __name__ == "__main__":
    unittest.main()
