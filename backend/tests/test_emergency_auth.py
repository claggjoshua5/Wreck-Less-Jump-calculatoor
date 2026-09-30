import asyncio
import hashlib
import os
from copy import deepcopy
from types import SimpleNamespace

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "wreckless_test")

from backend import server


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    def limit(self, *_args):
        return self

    async def to_list(self, length):
        return self.documents[:length]


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = deepcopy(documents or [])

    async def find_one(self, query):
        return next(
            (deepcopy(document) for document in self.documents if self._matches(document, query)),
            None,
        )

    async def update_one(self, query, update, upsert=False):
        document = next(
            (document for document in self.documents if self._matches(document, query)),
            None,
        )
        if document is None:
            if not upsert:
                return SimpleNamespace(matched_count=0)
            document = deepcopy(query)
            self.documents.append(document)
        document.update(deepcopy(update["$set"]))
        return SimpleNamespace(matched_count=1)

    async def insert_one(self, document):
        self.documents.append(deepcopy(document))

    def find(self, query):
        return FakeCursor(
            [deepcopy(document) for document in self.documents if self._matches(document, query)]
        )

    @staticmethod
    def _matches(document, query):
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(expected, dict) and "$ne" in expected:
                if actual == expected["$ne"]:
                    return False
            elif actual != expected:
                return False
        return True


@pytest.fixture
def emergency_db(monkeypatch):
    token = "valid-device-token"
    settings = {
        "device_id": "rider-1",
        "allow_notifications": True,
        "location_sharing_enabled": True,
        "alert_cooldown_ms": server.DEFAULT_ALERT_COOLDOWN_MS,
        "last_known_location": {"latitude": 47.6, "longitude": -122.3},
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
    }
    db = SimpleNamespace(
        emergency_settings=FakeCollection([settings]),
        emergency_alerts=FakeCollection(),
    )
    monkeypatch.setattr(server, "db", db)
    return db, token


def invoke(handler, *args, **kwargs):
    try:
        return 200, asyncio.run(handler(*args, **kwargs))
    except server.HTTPException as error:
        return error.status_code, error


def endpoint_call(operation, token):
    if operation == "settings_get":
        return invoke(server.get_emergency_settings, "rider-1", token)
    if operation == "settings_post":
        update = server.EmergencySettingsUpdate(allow_notifications=False)
        return invoke(server.update_emergency_settings, "rider-1", update, token)
    if operation == "call_for_help":
        request = server.CallForHelpRequest(device_id="rider-1")
        return invoke(server.call_for_help, request, token)
    request = server.AlertNearbyRidersRequest(
        device_id="rider-1",
        location=server.LocationData(latitude=47.6, longitude=-122.3),
    )
    return invoke(server.alert_nearby_riders, request, token)


@pytest.mark.parametrize(
    "operation",
    ["settings_get", "settings_post", "call_for_help", "alert_nearby_riders"],
)
@pytest.mark.parametrize(
    ("token", "expected_status"),
    [(None, 401), ("wrong-token", 401), ("valid-device-token", 200)],
)
def test_emergency_endpoints_require_device_token(emergency_db, operation, token, expected_status):
    status, _ = endpoint_call(operation, token)
    assert status == expected_status


def test_first_settings_post_claims_token_once(emergency_db):
    db, _ = emergency_db
    db.emergency_settings.documents.clear()

    status, first_response = invoke(
        server.update_emergency_settings,
        "new-rider",
        server.EmergencySettingsUpdate(),
    )
    assert status == 200
    first_body = first_response.model_dump(exclude_none=True)
    token = first_body.pop("device_token")
    assert len(token) > 32
    assert db.emergency_settings.documents[0]["token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert token not in db.emergency_settings.documents[0].values()

    status, second_response = invoke(
        server.update_emergency_settings,
        "new-rider",
        server.EmergencySettingsUpdate(),
        token,
    )
    assert status == 200
    assert "device_token" not in second_response.model_dump(exclude_none=True)


def test_settings_responses_never_expose_location_or_token_hash(emergency_db):
    db, token = emergency_db
    get_status, get_response = invoke(server.get_emergency_settings, "rider-1", token)
    post_status, post_response = invoke(
        server.update_emergency_settings,
        "rider-1",
        server.EmergencySettingsUpdate(allow_notifications=False),
        token,
    )

    forbidden_keys = {"latitude", "longitude", "last_known_location", "token_hash"}
    for status, response in [(get_status, get_response), (post_status, post_response)]:
        assert status == 200
        assert forbidden_keys.isdisjoint(response.model_dump(exclude_none=True))
    assert get_response.has_location is True
    assert post_response.has_location is True
    assert db.emergency_settings.documents[0]["token_hash"] == hashlib.sha256(token.encode()).hexdigest()


def test_settings_without_location_report_has_location_false(emergency_db):
    db, _ = emergency_db
    db.emergency_settings.documents[0]["last_known_location"] = None

    status, response = invoke(server.get_emergency_settings, "rider-1", "valid-device-token")

    assert status == 200
    assert response.has_location is False


def test_device_token_cannot_access_another_devices_settings(emergency_db):
    status, error = invoke(server.get_emergency_settings, "rider-2", "valid-device-token")

    assert status == 401
    assert error.detail == "Invalid or missing device token."
