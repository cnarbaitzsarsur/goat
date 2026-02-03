"""Routers for the processes API."""

from processes.routers.processes import router as processes_router
from processes.routers.workflows import router as workflows_router

__all__ = ["processes_router", "workflows_router"]
