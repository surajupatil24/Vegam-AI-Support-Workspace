"""Initial schema with all tables

Revision ID: 001
Revises:
Create Date: 2024-08-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(255), nullable=False, unique=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('redmine_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('role', sa.String(50), default='engineer'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_username'), 'users', ['username'])
    op.create_index(op.f('ix_users_email'), 'users', ['email'])

    # Create tickets table
    op.create_table(
        'tickets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('redmine_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('subject', sa.String(500), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('tracker', sa.String(100), nullable=True),
        sa.Column('priority', sa.String(50), nullable=True),
        sa.Column('status', sa.String(50), nullable=True),
        sa.Column('module', sa.String(255), nullable=True),
        sa.Column('customer', sa.String(255), nullable=True),
        sa.Column('assigned_to', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id']),
    )
    op.create_index(op.f('ix_tickets_redmine_id'), 'tickets', ['redmine_id'])

    # Create investigations table
    op.create_table(
        'investigations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ticket_id', sa.Integer(), nullable=False),
        sa.Column('engineer_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(50), default='in_progress'),
        sa.Column('redmine_data', postgresql.JSON(), nullable=True),
        sa.Column('similar_tickets', postgresql.JSON(), nullable=True),
        sa.Column('code_analysis', postgresql.JSON(), nullable=True),
        sa.Column('ai_analysis', postgresql.JSON(), nullable=True),
        sa.Column('root_cause', sa.Text(), nullable=True),
        sa.Column('investigation_steps', sa.Text(), nullable=True),
        sa.Column('recommended_fix', sa.Text(), nullable=True),
        sa.Column('confidence_score', sa.Float(), default=0.0),
        sa.Column('risks', sa.Text(), nullable=True),
        sa.Column('client_reply', sa.Text(), nullable=True),
        sa.Column('redmine_comment', sa.Text(), nullable=True),
        sa.Column('closure_notes', sa.Text(), nullable=True),
        sa.Column('ai_was_correct', sa.Boolean(), nullable=True),
        sa.Column('actual_solution', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('time_taken_minutes', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id']),
        sa.ForeignKeyConstraint(['engineer_id'], ['users.id']),
    )

    # Create ticket_comments table
    op.create_table(
        'ticket_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ticket_id', sa.Integer(), nullable=False),
        sa.Column('redmine_comment_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('author', sa.String(255), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id']),
    )
    op.create_index(op.f('ix_ticket_comments_redmine_comment_id'), 'ticket_comments', ['redmine_comment_id'])

    # Create knowledge_base table
    op.create_table(
        'knowledge_base',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('investigation_id', sa.Integer(), nullable=True),
        sa.Column('ticket_id', sa.Integer(), nullable=True),
        sa.Column('issue_summary', sa.Text(), nullable=True),
        sa.Column('root_cause', sa.Text(), nullable=True),
        sa.Column('solution', sa.Text(), nullable=True),
        sa.Column('keywords', sa.String(1000), nullable=True),
        sa.Column('embedding', postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column('engineer', sa.String(255), nullable=True),
        sa.Column('modules_involved', sa.String(500), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # Create ai_providers table
    op.create_table(
        'ai_providers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('api_key', sa.String(500), nullable=False),
        sa.Column('base_url', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('priority', sa.Integer(), default=0),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ai_providers_name'), 'ai_providers', ['name'])

    # Create system_config table
    op.create_table(
        'system_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('config_key', sa.String(255), nullable=False, unique=True),
        sa.Column('config_value', sa.Text(), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_system_config_config_key'), 'system_config', ['config_key'])


def downgrade() -> None:
    op.drop_index(op.f('ix_system_config_config_key'), table_name='system_config')
    op.drop_table('system_config')

    op.drop_index(op.f('ix_ai_providers_name'), table_name='ai_providers')
    op.drop_table('ai_providers')

    op.drop_table('knowledge_base')

    op.drop_index(op.f('ix_ticket_comments_redmine_comment_id'), table_name='ticket_comments')
    op.drop_table('ticket_comments')

    op.drop_table('investigations')

    op.drop_index(op.f('ix_tickets_redmine_id'), table_name='tickets')
    op.drop_table('tickets')

    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_table('users')

    op.execute('DROP EXTENSION IF EXISTS vector')
