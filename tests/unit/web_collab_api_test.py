import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from PIL import Image

_DATA_DIR = Path(tempfile.mkdtemp(prefix="labelme-web-collab-"))
os.environ.setdefault("LABELME_WEB_DATA_DIR", str(_DATA_DIR))
os.environ.setdefault("LABELME_WEB_DATABASE_URL", f"sqlite:///{_DATA_DIR / 'web-collab.sqlite3'}")
os.environ.setdefault("JWT_SECRET", "test-secret")


def test_collab_auth_upload_assign_start_save_versions_and_submit(tmp_path) -> None:
    TestClient = pytest.importorskip("fastapi.testclient").TestClient
    pytest.importorskip("sqlalchemy")
    from backend.app.main import app

    image = tmp_path / "001.jpg"
    Image.new("RGB", (32, 24), color="white").save(image)

    with TestClient(app) as client:
        admin_login = client.post("/api/auth/login", json={"username": "admin", "password": "secret"}).json()
        admin_headers = {"Authorization": f"Bearer {admin_login['token']}"}

        alice = client.post(
            "/api/users",
            headers=admin_headers,
            json={"username": "alice", "password": "alice-pass", "role": "annotator"},
        ).json()
        bob = client.post(
            "/api/users",
            headers=admin_headers,
            json={"username": "bob", "password": "bob-pass", "role": "annotator"},
        ).json()
        bob_login = client.post("/api/auth/login", json={"username": "bob", "password": "bob-pass"})
        assert bob_login.status_code == 200
        bob_headers = {"Authorization": f"Bearer {bob_login.json()['token']}"}
        alice_login = client.post("/api/auth/login", json={"username": "alice", "password": "alice-pass"}).json()
        alice_headers = {"Authorization": f"Bearer {alice_login['token']}"}

        project = client.post("/api/projects", headers=admin_headers, json={"name": "Manuscripts"}).json()
        dataset = client.post(
            f"/api/projects/{project['id']}/datasets",
            headers=admin_headers,
            json={"name": "Batch 1"},
        ).json()
        with open(image, "rb") as fh:
            upload = client.post(
                f"/api/datasets/{dataset['id']}/upload-images",
                headers=admin_headers,
                files=[("files", ("001.jpg", fh, "image/jpeg"))],
            ).json()
        assert upload["imported"] == 1

        forbidden_upload = client.post(
            f"/api/datasets/{dataset['id']}/upload-images",
            headers=alice_headers,
            files=[],
        )
        assert forbidden_upload.status_code in {400, 403, 422}

        tasks = client.get(f"/api/tasks?dataset_id={dataset['id']}", headers=alice_headers).json()
        assert tasks == []

        tasks = client.get(f"/api/tasks?dataset_id={dataset['id']}", headers=admin_headers).json()
        task_id = tasks[0]["id"]
        assert tasks[0]["status"] == "unassigned"
        assert tasks[0]["assignee_id"] is None

        denied_start = client.post(f"/api/tasks/{task_id}/start", headers=alice_headers)
        assert denied_start.status_code == 403

        assigned = client.post(
            f"/api/tasks/{task_id}/assign",
            headers=admin_headers,
            json={"assignee_id": alice["id"]},
        ).json()
        assert assigned["status"] == "assigned"
        assert assigned["assignee_id"] == alice["id"]
        assert assigned["locked_by"] is None

        alice_tasks = client.get(f"/api/tasks?dataset_id={dataset['id']}", headers=alice_headers).json()
        assert len(alice_tasks) == 1
        bob_tasks = client.get(f"/api/tasks?dataset_id={dataset['id']}", headers=bob_headers).json()
        assert bob_tasks == []

        read_only = client.get(f"/api/tasks/{task_id}/annotation", headers=alice_headers).json()
        assert read_only["version_index"] == 0
        after_read = client.get(f"/api/tasks?dataset_id={dataset['id']}", headers=admin_headers).json()[0]
        assert after_read["status"] == "assigned"
        assert after_read["locked_by"] is None

        bob_start = client.post(f"/api/tasks/{task_id}/start", headers=bob_headers)
        assert bob_start.status_code == 403

        started = client.post(f"/api/tasks/{task_id}/start", headers=alice_headers).json()
        assert started["locked_by"] == alice["id"]
        assert started["status"] == "in_progress"

        locked_reassign = client.post(
            f"/api/tasks/{task_id}/assign",
            headers=admin_headers,
            json={"assignee_id": bob["id"]},
        )
        assert locked_reassign.status_code == 409

        annotation_payload = {
                "version": "6.1.0",
                "flags": {},
                "imagePath": "001.jpg",
                "imageData": "base64",
                "imageHeight": 24,
                "imageWidth": 32,
                "shapes": [
                    {
                        "node_id": "n1",
                        "group_id": None,
                        "type": "MAIN_TEXT",
                        "shape_type": "rectangle",
                        "transcription_raw": "",
                        "transcription_semantic": "",
                        "points": [[1, 2], [10, 12]],
                        "attributes": {
                            "z_index": 0,
                            "color": "black",
                            "vague": False,
                            "reading_direction": "RTL",
                            "handwriting_style": "",
                        },
                        "edges": [],
                    }
                ],
            }
        saved = client.put(
            f"/api/tasks/{task_id}/annotation",
            headers=alice_headers,
            json=annotation_payload,
        ).json()
        assert saved["version_index"] == 1
        for key in ("flags", "version", "imagePath", "imageData"):
            assert key not in saved

        versions = client.get(f"/api/tasks/{task_id}/versions", headers=admin_headers).json()
        assert versions[0]["version_index"] == 1

        image_response = client.get(f"/api/images/{started['image_id']}/file", headers=alice_headers)
        assert image_response.status_code == 200

        submitted = client.post(f"/api/tasks/{task_id}/submit", headers=alice_headers).json()
        assert submitted["status"] == "submitted"
        assert submitted["locked_by"] is None

        stale_locked = client.post(f"/api/tasks/{task_id}/start", headers=alice_headers).json()
        assert stale_locked["status"] == "in_progress"
        client.post(f"/api/tasks/{task_id}/submit", headers=alice_headers).json()
        # Simulate an old database row where a submitted task still carries a stale lock.
        from backend.app.db import SessionLocal
        from backend.app.models.collab import Task

        with SessionLocal() as db:
            task = db.get(Task, task_id)
            task.locked_by = bob["id"]
            db.commit()

        reopened = client.post(f"/api/tasks/{task_id}/start", headers=alice_headers).json()
        assert reopened["status"] == "in_progress"
        assert reopened["locked_by"] == alice["id"]

        resaved = client.put(
            f"/api/tasks/{task_id}/annotation",
            headers=alice_headers,
            json=annotation_payload,
        ).json()
        assert resaved["version_index"] == 2

        resubmitted = client.post(f"/api/tasks/{task_id}/submit", headers=alice_headers).json()
        assert resubmitted["status"] == "submitted"
        assert resubmitted["locked_by"] is None

        cancelled = client.post(
            f"/api/tasks/{task_id}/assign",
            headers=admin_headers,
            json={"assignee_id": None},
        ).json()
        assert cancelled["status"] == "unassigned"
        assert cancelled["assignee_id"] is None
        assert cancelled["locked_by"] is None

        bob_hidden_tasks = client.get(f"/api/tasks?dataset_id={dataset['id']}", headers=bob_headers).json()
        assert bob_hidden_tasks == []
        bob_read_after_cancel = client.get(f"/api/tasks/{task_id}/annotation", headers=bob_headers)
        assert bob_read_after_cancel.status_code == 403

        preserved = client.get(f"/api/tasks/{task_id}/annotation", headers=admin_headers).json()
        assert preserved["version_index"] == 2
        versions = client.get(f"/api/tasks/{task_id}/versions", headers=admin_headers).json()
        assert [version["version_index"] for version in versions[:2]] == [2, 1]


def _setup_collab_test(client, suffix=""):
    """Create an admin, project, dataset, upload an image, and return IDs and headers."""
    from PIL import Image
    import tempfile
    import time

    tag = suffix or str(int(time.time() * 1000) % 100000)

    # Try existing admin first, auto-create only if DB is empty
    admin_resp = client.post("/api/auth/login", json={"username": "admin", "password": "secret"})
    if admin_resp.status_code == 401:
        admin_resp = client.post("/api/auth/login", json={"username": "admin", "password": "secret"})
    admin_login = admin_resp.json()
    admin_headers = {"Authorization": f"Bearer {admin_login['token']}"}

    annotator_name = f"ann_{tag}"
    annotator = client.post(
        "/api/users",
        headers=admin_headers,
        json={"username": annotator_name, "password": "pass", "role": "annotator"},
    ).json()
    annotator_login = client.post("/api/auth/login", json={"username": annotator_name, "password": "pass"}).json()
    annotator_headers = {"Authorization": f"Bearer {annotator_login['token']}"}

    project = client.post("/api/projects", headers=admin_headers, json={"name": f"Project_{tag}"}).json()
    dataset = client.post(
        f"/api/projects/{project['id']}/datasets",
        headers=admin_headers,
        json={"name": f"Dataset_{tag}"},
    ).json()

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        Image.new("RGB", (32, 24), color="white").save(f.name)
        with open(f.name, "rb") as fh:
            upload = client.post(
                f"/api/datasets/{dataset['id']}/upload-images",
                headers=admin_headers,
                files=[("files", ("test.jpg", fh, "image/jpeg"))],
            ).json()
    assert upload["imported"] == 1

    tasks = client.get(f"/api/tasks?dataset_id={dataset['id']}", headers=admin_headers).json()
    task_id = tasks[0]["id"]

    return {
        "admin_headers": admin_headers,
        "annotator": annotator,
        "annotator_headers": annotator_headers,
        "task_id": task_id,
        "dataset_id": dataset["id"],
    }


def test_review_workflow(tmp_path) -> None:
    TestClient = pytest.importorskip("fastapi.testclient").TestClient
    pytest.importorskip("sqlalchemy")
    from backend.app.main import app

    with TestClient(app) as client:
        ctx = _setup_collab_test(client, suffix="rv")
        task_id = ctx["task_id"]
        annotator_headers = ctx["annotator_headers"]
        admin_headers = ctx["admin_headers"]

        # Assign to annotator
        client.post(
            f"/api/tasks/{task_id}/assign",
            headers=admin_headers,
            json={"assignee_id": ctx["annotator"]["id"]},
        )
        # Lock and submit
        client.post(f"/api/tasks/{task_id}/start", headers=annotator_headers)
        client.post(f"/api/tasks/{task_id}/submit", headers=annotator_headers)
        task = client.get(f"/api/tasks?dataset_id={ctx['dataset_id']}", headers=admin_headers).json()[0]
        assert task["status"] == "submitted"

        # Create reviewer
        rev_name = f"rev_{ctx['annotator']['username']}"
        reviewer = client.post(
            "/api/users",
            headers=admin_headers,
            json={"username": rev_name, "password": "rev-pass", "role": "reviewer"},
        ).json()
        rev_login = client.post(
            "/api/auth/login", json={"username": rev_name, "password": "rev-pass"}
        ).json()
        rev_headers = {"Authorization": f"Bearer {rev_login['token']}"}

        # Annotator cannot review
        bad_review = client.post(f"/api/tasks/{task_id}/review", headers=annotator_headers)
        assert bad_review.status_code in {403, 409}

        # Reviewer approves
        reviewed = client.post(f"/api/tasks/{task_id}/review", headers=rev_headers).json()
        assert reviewed["status"] == "reviewed"
        assert reviewed["locked_by"] is None

        # Reviewed task cannot be re-reviewed
        double_review = client.post(f"/api/tasks/{task_id}/review", headers=rev_headers)
        assert double_review.status_code == 409

        # Create second task for reject test (use different image to avoid hash collision)
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            from PIL import Image
            Image.new("RGB", (64, 48), color="black").save(f.name)
            with open(f.name, "rb") as fh:
                client.post(
                    f"/api/datasets/{ctx['dataset_id']}/upload-images",
                    headers=admin_headers,
                    files=[("files", ("test2.jpg", fh, "image/jpeg"))],
                )
        tasks2 = client.get(f"/api/tasks?dataset_id={ctx['dataset_id']}", headers=admin_headers).json()
        task2_id = [t for t in tasks2 if t["id"] != task_id][0]["id"]

        client.post(
            f"/api/tasks/{task2_id}/assign",
            headers=admin_headers,
            json={"assignee_id": ctx["annotator"]["id"]},
        )
        client.post(f"/api/tasks/{task2_id}/start", headers=annotator_headers)
        client.post(f"/api/tasks/{task2_id}/submit", headers=annotator_headers)

        # Reviewer rejects
        rejected = client.post(f"/api/tasks/{task2_id}/reject", headers=rev_headers).json()
        assert rejected["status"] == "rejected"
        assert rejected["locked_by"] is None

        # Annotator can re-lock rejected task
        restarted = client.post(f"/api/tasks/{task2_id}/start", headers=annotator_headers).json()
        assert restarted["status"] == "in_progress"
        assert restarted["locked_by"] == ctx["annotator"]["id"]


def test_lock_timeout(tmp_path) -> None:
    TestClient = pytest.importorskip("fastapi.testclient").TestClient
    pytest.importorskip("sqlalchemy")
    from backend.app.main import app
    from backend.app.db import SessionLocal
    from backend.app.models.collab import Task

    with TestClient(app) as client:
        ctx = _setup_collab_test(client, suffix="lt")
        task_id = ctx["task_id"]
        admin_headers = ctx["admin_headers"]

        # Create second annotator
        bob_name = f"bob_lt_{ctx['annotator']['username']}"
        bob = client.post(
            "/api/users",
            headers=admin_headers,
            json={"username": bob_name, "password": "bob-pass", "role": "annotator"},
        ).json()

        # Assign to annotator1 and lock
        client.post(
            f"/api/tasks/{task_id}/assign",
            headers=admin_headers,
            json={"assignee_id": ctx["annotator"]["id"]},
        )
        client.post(f"/api/tasks/{task_id}/start", headers=ctx["annotator_headers"])

        # Simulate stale lock (1 hour old, held by bob2)
        with SessionLocal() as db:
            task = db.get(Task, task_id)
            task.locked_by = bob["id"]
            task.locked_at = datetime.utcnow() - timedelta(minutes=60)
            db.commit()

        # annotator1 should be able to re-acquire despite bob2's stale lock
        restarted = client.post(f"/api/tasks/{task_id}/start", headers=ctx["annotator_headers"]).json()
        assert restarted["locked_by"] == ctx["annotator"]["id"]

        # Admin can reassign a task with a stale lock
        client.post(f"/api/tasks/{task_id}/release", headers=ctx["annotator_headers"])
        with SessionLocal() as db:
            task = db.get(Task, task_id)
            task.locked_by = bob["id"]
            task.locked_at = datetime.utcnow() - timedelta(minutes=60)
            db.commit()

        reassigned = client.post(
            f"/api/tasks/{task_id}/assign",
            headers=admin_headers,
            json={"assignee_id": bob["id"]},
        ).json()
        assert reassigned["assignee_id"] == bob["id"]


def test_assignee_username_filter(tmp_path) -> None:
    TestClient = pytest.importorskip("fastapi.testclient").TestClient
    pytest.importorskip("sqlalchemy")
    from backend.app.main import app

    with TestClient(app) as client:
        ctx = _setup_collab_test(client, suffix="af")
        admin_headers = ctx["admin_headers"]
        dataset_id = ctx["dataset_id"]
        annotator_id = ctx["annotator"]["id"]
        annotator_name = ctx["annotator"]["username"]

        # Assign task
        client.post(
            f"/api/tasks/{ctx['task_id']}/assign",
            headers=admin_headers,
            json={"assignee_id": annotator_id},
        )

        # Filter by assignee username
        filtered = client.get(
            f"/api/tasks?dataset_id={dataset_id}&assignee={annotator_name}",
            headers=admin_headers,
        ).json()
        assert len(filtered) == 1
        assert filtered[0]["assignee_id"] == annotator_id

        # Filter by non-existent username returns empty
        empty = client.get(
            f"/api/tasks?dataset_id={dataset_id}&assignee=nobody_xyz",
            headers=admin_headers,
        ).json()
        assert empty == []

        # Cross-check: bob should not see tasks assigned to annotator1
        bob_name = f"bob_af_{annotator_name}"
        bob = client.post(
            "/api/users",
            headers=admin_headers,
            json={"username": bob_name, "password": "bob-pass", "role": "annotator"},
        ).json()
        bob_login = client.post(
            "/api/auth/login", json={"username": bob_name, "password": "bob-pass"}
        ).json()
        bob_headers = {"Authorization": f"Bearer {bob_login['token']}"}
        bob_tasks = client.get(f"/api/tasks?dataset_id={dataset_id}", headers=bob_headers).json()
        assert bob_tasks == []
