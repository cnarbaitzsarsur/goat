"""change scenario_feature feature_id from uuid to text

Revision ID: a1b2c3d4e5f6
Revises: 44c27ff7ceb6
Create Date: 2026-02-14 21:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "44c27ff7ceb6"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE customer.scenario_feature "
        "ALTER COLUMN feature_id TYPE TEXT USING feature_id::TEXT;"
    )


def downgrade():
    op.execute(
        "ALTER TABLE customer.scenario_feature "
        "ALTER COLUMN feature_id TYPE UUID USING feature_id::UUID;"
    )
