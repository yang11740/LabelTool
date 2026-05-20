import os
import tempfile
from pathlib import Path

import pytest
from PIL import Image

_DATA_DIR = Path(tempfile.mkdtemp(prefix="labelme-web-collab-"))
os.environ.setdefault("LABELME_WEB_DATA_DIR", str(_DATA_DIR))
os.environ.setdefault("LABELME_WEB_DATABASE_URL", f"sqlite:///{_DATA_DIR / 'web-collab.sqlite3'}")
os.environ.setdefault("JWT_SECRET", "test-secret")


def test_collab_auth_upload_claim_save_versions_and_submit(tmp_path) -> None:
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
        bob_login = client.post("/api/auth/login", json={"username": "bob", "password": "bob-pass"})
        assert bob_login.status_code == 401
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
        task_id = tasks[0]["id"]

        claimed = client.post(f"/api/tasks/{task_id}/claim", headers=alice_headers).json()
        assert claimed["locked_by"] == alice["id"]
        assert claimed["status"] == "in_progress"

        saved = client.put(
            f"/api/tasks/{task_id}/annotation",
            headers=alice_headers,
            json={
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
            },
        ).json()
        assert saved["version_index"] == 1
        for key in ("flags", "version", "imagePath", "imageData"):
            assert key not in saved

        versions = client.get(f"/api/tasks/{task_id}/versions", headers=admin_headers).json()
        assert versions[0]["version_index"] == 1

        image_response = client.get(f"/api/images/{claimed['image_id']}/file", headers=alice_headers)
        assert image_response.status_code == 200

        submitted = client.post(f"/api/tasks/{task_id}/submit", headers=alice_headers).json()
        assert submitted["status"] == "submitted"
        assert submitted["locked_by"] is None
