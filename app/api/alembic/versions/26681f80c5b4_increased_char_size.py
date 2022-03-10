"""Increased char size

Revision ID: 26681f80c5b4
Revises: da770d01fcb8
Create Date: 2022-03-09 16:31:16.091080

"""
from alembic import op
import sqlalchemy as sa
import geoalchemy2
import sqlmodel  



# revision identifiers, used by Alembic.
revision = '26681f80c5b4'
down_revision = 'da770d01fcb8'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.alter_column('reached_edge_heatmap_grid_calculation', 'edge_type',
               existing_type=sa.VARCHAR(length=1),
               type_=sa.String(length=2),
               existing_nullable=False,
               schema='customer')
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.alter_column('reached_edge_heatmap_grid_calculation', 'edge_type',
               existing_type=sa.String(length=2),
               type_=sa.VARCHAR(length=1),
               existing_nullable=False,
               schema='customer')
    # ### end Alembic commands ###
