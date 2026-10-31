import asyncio
from contextlib import asynccontextmanager
from contextlib import suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router
from app.config import settings
from app.db.database import Base, engine
from app.utils.redmine_cache import run_redmine_cache_scheduler

# Create database tables (gracefully handle connection errors)
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Warning: Could not create database tables on startup: {e}")
    print("Tables will be created on first database access")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Use ASCII-only startup logs so Windows console encoding does not crash boot.
    print("Samixa AI Support Assistant starting...")
    cache_stop_event = asyncio.Event()
    cache_task = asyncio.create_task(
        run_redmine_cache_scheduler(cache_stop_event),
        name="redmine-cache-refresh",
    )

    try:
        yield
    finally:
        cache_stop_event.set()
        cache_task.cancel()
        with suppress(asyncio.CancelledError):
            await cache_task
        print("Samixa shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(api_router, prefix="/api")


@app.get("/")
def read_root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
