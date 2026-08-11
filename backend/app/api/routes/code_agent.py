from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class CodeAgentRequest(BaseModel):
    ticket_id: int
    description: str = ""


class CodeFile(BaseModel):
    path: str
    language: str
    relevance: float
    potential_issues: list[str]


class CodeAnalysisResponse(BaseModel):
    ticket_id: int
    files_analyzed: int
    services_involved: int
    controllers_found: int
    potential_issues: list[str]
    files: list[CodeFile]
    status: str


# Mock repository structure for demo
MOCK_REPOSITORY = {
    "services": [
        {
            "name": "AuthenticationService",
            "path": "src/services/AuthenticationService.ts",
            "language": "TypeScript",
            "keywords": ["auth", "login", "token", "session", "credential"],
            "issues": [
                "Missing token refresh logic for mobile",
                "No timeout handling for slow networks",
                "Session not persisted after network switch"
            ]
        },
        {
            "name": "UserSessionService",
            "path": "src/services/user-session.ts",
            "language": "TypeScript",
            "keywords": ["session", "user", "logout", "expiry", "timeout"],
            "issues": [
                "Volatile memory storage",
                "No encryption for session data",
                "Missing background refresh"
            ]
        },
        {
            "name": "LabelPrintingService",
            "path": "src/services/label-printer.ts",
            "language": "TypeScript",
            "keywords": ["label", "print", "format", "dimension", "printer"],
            "issues": [
                "Incorrect dimension mapping for large labels",
                "Missing label size validation",
                "No printer capability detection"
            ]
        }
    ],
    "controllers": [
        {
            "name": "AuthController",
            "path": "src/controllers/auth.controller.ts",
            "language": "TypeScript",
            "keywords": ["login", "auth", "authenticate", "credential"],
            "issues": ["No request validation", "Missing error handling"]
        },
        {
            "name": "LabelsController",
            "path": "src/controllers/labels.controller.ts",
            "language": "TypeScript",
            "keywords": ["label", "print", "format"],
            "issues": ["Hardcoded dimensions", "No error recovery"]
        }
    ],
    "modules": [
        {
            "name": "mobile-login",
            "path": "src/auth/mobile-login.ts",
            "language": "TypeScript",
            "keywords": ["mobile", "login", "app", "ios", "android"],
            "issues": [
                "Timeout on 3G networks",
                "Memory leak in input handler",
                "No crash recovery"
            ]
        },
        {
            "name": "api-authentication",
            "path": "src/api/authentication.ts",
            "language": "TypeScript",
            "keywords": ["api", "auth", "header", "token"],
            "issues": ["Missing auth header injection", "Incomplete endpoint coverage"]
        },
        {
            "name": "label-formatting",
            "path": "src/modules/label-formatting.ts",
            "language": "TypeScript",
            "keywords": ["label", "format", "size", "dimension", "printer"],
            "issues": ["Dimension calculation errors", "Missing format validation"]
        }
    ]
}


def extract_keywords(text: str) -> list[str]:
    """Extract keywords from text for code search"""
    if not text:
        return []
    words = text.lower().split()
    stopwords = {"the", "a", "an", "and", "or", "is", "are", "in", "on", "at", "to", "for", "of", "error", "issue"}
    return [w for w in words if w not in stopwords and len(w) > 3]


def calculate_relevance(keywords: list[str], file_keywords: list[str]) -> float:
    """Calculate relevance score between 0-1"""
    if not keywords or not file_keywords:
        return 0.0

    set_keywords = set(keywords)
    set_file = set(file_keywords)
    intersection = len(set_keywords.intersection(set_file))
    union = len(set_keywords.union(set_file))

    return intersection / union if union > 0 else 0.0


@router.post("/analyze")
async def analyze_code(
    request: CodeAgentRequest,
    db: Session = Depends(get_db)
):
    """
    Code Agent: Analyze repositories and find relevant code files

    Searches for:
    - Relevant source files
    - Services and controllers
    - Potential issues and bugs
    - File paths and line numbers
    """
    try:
        # Extract keywords from description
        description_keywords = extract_keywords(request.description)

        if not description_keywords:
            return CodeAnalysisResponse(
                ticket_id=request.ticket_id,
                files_analyzed=0,
                services_involved=0,
                controllers_found=0,
                potential_issues=[],
                files=[],
                status="no_keywords"
            )

        found_files = []
        services_found = 0
        controllers_found = 0
        all_issues = set()

        # Search in services
        for service in MOCK_REPOSITORY["services"]:
            relevance = calculate_relevance(description_keywords, service["keywords"])

            if relevance > 0.15:
                services_found += 1
                found_files.append({
                    "path": service["path"],
                    "language": service["language"],
                    "relevance": round(relevance, 2),
                    "potential_issues": service["issues"][:2]
                })
                all_issues.update(service["issues"])

        # Search in controllers
        for controller in MOCK_REPOSITORY["controllers"]:
            relevance = calculate_relevance(description_keywords, controller["keywords"])

            if relevance > 0.15:
                controllers_found += 1
                found_files.append({
                    "path": controller["path"],
                    "language": controller["language"],
                    "relevance": round(relevance, 2),
                    "potential_issues": controller["issues"]
                })
                all_issues.update(controller["issues"])

        # Search in modules
        for module in MOCK_REPOSITORY["modules"]:
            relevance = calculate_relevance(description_keywords, module["keywords"])

            if relevance > 0.15:
                found_files.append({
                    "path": module["path"],
                    "language": module["language"],
                    "relevance": round(relevance, 2),
                    "potential_issues": module["issues"]
                })
                all_issues.update(module["issues"])

        # Sort by relevance
        found_files.sort(key=lambda x: x["relevance"], reverse=True)

        # Limit to top results
        top_files = found_files[:8]

        formatted_files = [
            CodeFile(
                path=f["path"],
                language=f["language"],
                relevance=f["relevance"],
                potential_issues=f["potential_issues"]
            )
            for f in top_files
        ]

        return CodeAnalysisResponse(
            ticket_id=request.ticket_id,
            files_analyzed=len(top_files),
            services_involved=services_found,
            controllers_found=controllers_found,
            potential_issues=list(all_issues)[:5],
            files=formatted_files,
            status="completed"
        )

    except Exception as e:
        logger.error(f"Code analysis failed: {e}")
        return CodeAnalysisResponse(
            ticket_id=request.ticket_id,
            files_analyzed=0,
            services_involved=0,
            controllers_found=0,
            potential_issues=[],
            files=[],
            status="error"
        )
