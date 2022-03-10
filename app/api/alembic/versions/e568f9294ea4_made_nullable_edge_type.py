"""Made nullable edge_type

Revision ID: e568f9294ea4
Revises: 0392c9f74bf4
Create Date: 2022-03-09 16:38:14.812862

"""
from alembic import op
import sqlalchemy as sa
import geoalchemy2
import sqlmodel  



# revision identifiers, used by Alembic.
revision = 'e568f9294ea4'
down_revision = '0392c9f74bf4'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.alter_column('reached_edge_heatmap_grid_calculation', 'edge_type',
               existing_type=sa.VARCHAR(length=2),
               nullable=True,
               schema='customer')
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.alter_column('reached_edge_heatmap_grid_calculation', 'edge_type',
               existing_type=sa.VARCHAR(length=2),
               nullable=False,
               schema='customer')
    # ### end Alembic commands ###
