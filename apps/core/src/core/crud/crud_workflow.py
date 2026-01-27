"""
Workflow CRUD Operations
"""

from typing import List
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.db.models.workflow import Workflow
from core.schemas.workflow import WorkflowCreate, WorkflowUpdate

from .base import CRUDBase


class CRUDWorkflow(CRUDBase[Workflow, WorkflowCreate, WorkflowUpdate]):
    """CRUD operations for Workflow model."""

    async def get_by_project(
        self,
        async_session: AsyncSession,
        *,
        project_id: UUID,
    ) -> List[Workflow]:
        """Get all workflows for a project."""
        statement = select(self.model).where(self.model.project_id == project_id)
        result = await async_session.execute(statement)
        return list(result.scalars().all())

    async def get_by_project_and_id(
        self,
        async_session: AsyncSession,
        *,
        project_id: UUID,
        workflow_id: UUID,
    ) -> Workflow | None:
        """Get a specific workflow by project and workflow ID."""
        statement = select(self.model).where(
            self.model.project_id == project_id,
            self.model.id == workflow_id,
        )
        result = await async_session.execute(statement)
        return result.scalars().first()

    async def create_for_project(
        self,
        async_session: AsyncSession,
        *,
        project_id: UUID,
        obj_in: WorkflowCreate,
    ) -> Workflow:
        """Create a new workflow for a project."""
        # If this is set as default, unset any existing default
        if obj_in.is_default:
            await self._unset_default_for_project(async_session, project_id=project_id)

        db_obj = Workflow(
            project_id=project_id,
            **obj_in.model_dump(),
        )
        async_session.add(db_obj)
        await async_session.commit()
        await async_session.refresh(db_obj)
        return db_obj

    async def update_for_project(
        self,
        async_session: AsyncSession,
        *,
        project_id: UUID,
        workflow_id: UUID,
        obj_in: WorkflowUpdate,
    ) -> Workflow | None:
        """Update a workflow."""
        db_obj = await self.get_by_project_and_id(
            async_session, project_id=project_id, workflow_id=workflow_id
        )
        if not db_obj:
            return None

        update_data = obj_in.model_dump(exclude_unset=True)

        # If setting as default, unset any existing default
        if update_data.get("is_default"):
            await self._unset_default_for_project(
                async_session, project_id=project_id, exclude_id=workflow_id
            )

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        async_session.add(db_obj)
        await async_session.commit()
        await async_session.refresh(db_obj)
        return db_obj

    async def delete_for_project(
        self,
        async_session: AsyncSession,
        *,
        project_id: UUID,
        workflow_id: UUID,
    ) -> bool:
        """Delete a workflow."""
        db_obj = await self.get_by_project_and_id(
            async_session, project_id=project_id, workflow_id=workflow_id
        )
        if not db_obj:
            return False

        await async_session.delete(db_obj)
        await async_session.commit()
        return True

    async def duplicate(
        self,
        async_session: AsyncSession,
        *,
        project_id: UUID,
        workflow_id: UUID,
        new_name: str | None = None,
    ) -> Workflow | None:
        """Duplicate a workflow."""
        db_obj = await self.get_by_project_and_id(
            async_session, project_id=project_id, workflow_id=workflow_id
        )
        if not db_obj:
            return None

        # Deep copy config to avoid reference issues
        import copy

        new_config = copy.deepcopy(db_obj.config)

        new_workflow = Workflow(
            project_id=project_id,
            name=new_name or f"{db_obj.name} (Copy)",
            description=db_obj.description,
            is_default=False,  # Duplicates are never default
            config=new_config,
            thumbnail_url=None,  # Reset thumbnail
        )
        async_session.add(new_workflow)
        await async_session.commit()
        await async_session.refresh(new_workflow)
        return new_workflow

    async def _unset_default_for_project(
        self,
        async_session: AsyncSession,
        *,
        project_id: UUID,
        exclude_id: UUID | None = None,
    ) -> None:
        """Unset the default flag for all workflows in a project."""
        statement = (
            update(self.model)
            .where(self.model.project_id == project_id)
            .where(self.model.is_default == True)  # noqa: E712
            .values(is_default=False)
        )
        if exclude_id:
            statement = statement.where(self.model.id != exclude_id)
        await async_session.execute(statement)


workflow = CRUDWorkflow(Workflow)
