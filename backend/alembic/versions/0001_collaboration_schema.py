"""collaboration schema

Revision ID: 0001_collaboration_schema
Revises:
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_collaboration_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=256), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False, unique=True),
        sa.Column("description", sa.Text(), default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "datasets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), default=""),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "name", name="uq_datasets_project_name"),
    )
    op.create_index("ix_datasets_project_id", "datasets", ["project_id"])

    op.create_table(
        "image_assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("dataset_id", sa.Integer(), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("file_name", sa.String(length=260), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("width", sa.Integer(), default=0),
        sa.Column("height", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("dataset_id", "file_name", name="uq_images_dataset_file_name"),
    )
    op.create_index("ix_image_assets_dataset_id", "image_assets", ["dataset_id"])

    op.create_table(
        "annotations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_assets.id"), nullable=False, unique=True),
        sa.Column("current_json", sa.JSON(), default={}),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "annotation_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("annotation_id", sa.Integer(), sa.ForeignKey("annotations.id"), nullable=False),
        sa.Column("version_index", sa.Integer(), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("annotation_id", "version_index", name="uq_annotation_version"),
    )
    op.create_index("ix_annotation_versions_annotation_id", "annotation_versions", ["annotation_id"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_id", sa.Integer(), sa.ForeignKey("image_assets.id"), nullable=False, unique=True),
        sa.Column("status", sa.String(length=32), default="unassigned"),
        sa.Column("assignee_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("locked_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_tasks_status", "tasks", ["status"])
    op.create_index("ix_tasks_assignee_id", "tasks", ["assignee_id"])
    op.create_index("ix_tasks_locked_by", "tasks", ["locked_by"])


def downgrade() -> None:
    op.drop_table("tasks")
    op.drop_table("annotation_versions")
    op.drop_table("annotations")
    op.drop_table("image_assets")
    op.drop_table("datasets")
    op.drop_table("projects")
    op.drop_table("users")
