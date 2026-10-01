"""Tests for the emergency-alert endpoints in backend/server.py.

Uses httpx's ASGI transport against the FastAPI app, backed by an in-memory
mongomock-motor database so no real MongoDB instance is required.
"""
import asyncio
import hashlib
from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

NYC = {"latitude": 40.7128, "longitude": -74.0060}
# ~4.9 miles north of NYC (1 degree latitude ~= 69 miles).
NEARBY_RIDER = {"latitude": 40.7128 + (4.9 / 69.0), "longitude": -74.0060}
# ~5.1 miles north of NYC.
FAR_RIDER = {"latitude": 40.7128 + (5.1 / 69.0), "longitude": -74.0060}


async def client_for(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def enable_sharing(app, emergency_device_id, token, location=NYC, allow_notifications=True):
    async with await client_for(app) as client:
        resp = await client.post(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": token},
            json={
                "location_sharing_enabled": True,
                "allow_notifications": allow_notifications,
                "location": location,
            },
        )
        assert resp.status_code == 200, resp.text
        return resp.json()


# ---------------------------------------------------------------------------
# Enrollment: idempotency, retry-safety, concurrency
# ---------------------------------------------------------------------------

async def test_enroll_same_secret_twice_is_idempotent(app):
    emergency_device_id = "emg-idempotent"
    token = "secret-one"

    first = await enable_sharing(app, emergency_device_id, token)
    second = await enable_sharing(app, emergency_device_id, token, allow_notifications=False)

    assert first["location_sharing_enabled"] is True
    # Same secret on the existing record succeeds and settings can still be changed.
    assert second["allow_notifications"] is False
    assert second["location_sharing_enabled"] is True


async def test_enroll_different_secret_on_existing_record_returns_401(app):
    emergency_device_id = "emg-conflict"
    await enable_sharing(app, emergency_device_id, "secret-one")

    async with await client_for(app) as client:
        resp = await client.post(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": "secret-two"},
            json={"location_sharing_enabled": True},
        )
    assert resp.status_code == 401


async def test_lost_response_retry_with_same_secret_still_succeeds(app):
    """Simulates a client that enrolled, never saw the (discarded) response, and retries
    with the same locally-persisted secret. The retry must recover the same claim."""
    emergency_device_id = "emg-retry"
    token = "secret-retry"

    first = await enable_sharing(app, emergency_device_id, token)
    # Pretend the first response was lost/discarded by the client.
    del first

    retry = await enable_sharing(app, emergency_device_id, token)
    assert retry["location_sharing_enabled"] is True


async def test_concurrent_enrollment_same_secret_produces_one_document(app, db):
    emergency_device_id = "emg-concurrent-same"
    token = "same-secret"

    async def do_post():
        async with await client_for(app) as client:
            return await client.post(
                f"/api/emergency/settings/{emergency_device_id}",
                headers={"X-Device-Token": token},
                json={"location_sharing_enabled": True},
            )

    responses = await asyncio.gather(*[do_post() for _ in range(10)])
    assert all(resp.status_code == 200 for resp in responses)

    # NOTE: mongomock-motor cannot faithfully reproduce MongoDB's real unique-index /
    # find_one_and_update race semantics (no true concurrent storage engine), so this
    # mainly validates the idempotent-upsert code path rather than a genuine multi-process
    # race. The production code (server.enroll_or_verify) relies on a real unique index
    # plus $setOnInsert for correctness under true concurrency.
    docs = await db.emergency_settings.find({"emergency_device_id": emergency_device_id}).to_list(100)
    assert len(docs) == 1
    assert docs[0]["token_hash"] == hashlib.sha256(token.encode()).hexdigest()


async def test_concurrent_enrollment_different_secrets_exactly_one_winner(app, db):
    emergency_device_id = "emg-concurrent-diff"

    async def do_post(token):
        async with await client_for(app) as client:
            return await client.post(
                f"/api/emergency/settings/{emergency_device_id}",
                headers={"X-Device-Token": token},
                json={"location_sharing_enabled": True},
            )

    tokens = [f"secret-{i}" for i in range(10)]
    responses = await asyncio.gather(*[do_post(token) for token in tokens])

    # See the concurrency caveat above: mongomock-motor serializes operations, so exactly
    # one request "wins" here in practice, but this doesn't exercise a true storage-engine
    # race. It still verifies that only one document is ever created and that every other
    # secret is rejected against it.
    successes = [r for r in responses if r.status_code == 200]
    failures = [r for r in responses if r.status_code == 401]
    assert len(successes) == 1
    assert len(failures) == len(responses) - 1

    docs = await db.emergency_settings.find({"emergency_device_id": emergency_device_id}).to_list(100)
    assert len(docs) == 1


# ---------------------------------------------------------------------------
# Settings endpoint
# ---------------------------------------------------------------------------

async def test_get_settings_unenrolled_device_returns_defaults_without_creating_doc(app, db):
    emergency_device_id = "emg-first-time-rider"
    secret = "secret-first-time-rider"

    # First-time GET returns 200 with default settings and creates no record.
    async with await client_for(app) as client:
        resp = await client.get(f"/api/emergency/settings/{emergency_device_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["allow_notifications"] is True
        assert data["location_sharing_enabled"] is False
        assert data["alert_cooldown_ms"] == 300000
        assert data["has_location"] is False

    doc = await db.emergency_settings.find_one({"emergency_device_id": emergency_device_id})
    assert doc is None

    # Subsequent POST with client secret enrolls successfully.
    async with await client_for(app) as client:
        enroll_resp = await client.post(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": secret},
            json={"location_sharing_enabled": True},
        )
        assert enroll_resp.status_code == 200
        assert enroll_resp.json()["location_sharing_enabled"] is True

    # Later GETs require that secret.
    async with await client_for(app) as client:
        get_resp = await client.get(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": secret},
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["location_sharing_enabled"] is True


async def test_get_settings_enrolled_device_wrong_or_missing_token_returns_401(app):
    emergency_device_id = "emg-enrolled-token-check"
    secret = "secret-enrolled-token-check"
    await enable_sharing(app, emergency_device_id, secret)

    async with await client_for(app) as client:
        wrong_token_resp = await client.get(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": "wrong-secret"},
        )
        assert wrong_token_resp.status_code == 401

        no_token_resp = await client.get(f"/api/emergency/settings/{emergency_device_id}")
        assert no_token_resp.status_code == 401


async def test_post_settings_sharing_off_clears_location(app):
    emergency_device_id = "emg-clear-location"
    token = "token-clear-location"
    await enable_sharing(app, emergency_device_id, token)

    async with await client_for(app) as client:
        resp = await client.post(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": token},
            json={"location_sharing_enabled": False},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["location_sharing_enabled"] is False
    assert "last_known_location" not in body


async def test_post_settings_location_ignored_when_sharing_off(app):
    emergency_device_id = "emg-ignore-location"
    token = "token-ignore-location"
    async with await client_for(app) as client:
        resp = await client.post(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": token},
            json={"location_sharing_enabled": False, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "last_known_location" not in body
    assert body["has_location"] is False


async def test_blank_device_id_returns_400(app):
    async with await client_for(app) as client:
        resp = await client.get("/api/emergency/settings/%20", headers={"X-Device-Token": "x"})
    assert resp.status_code == 400


async def test_out_of_range_coordinates_return_422(app):
    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/settings/some-device",
            headers={"X-Device-Token": "some-token"},
            json={
                "location_sharing_enabled": True,
                "location": {"latitude": 999, "longitude": -74.0060},
            },
        )
    assert resp.status_code == 422


async def test_settings_responses_never_leak_private_fields(app):
    emergency_device_id = "emg-private-fields"
    token = "token-private-fields"
    body = await enable_sharing(app, emergency_device_id, token)

    forbidden_keys = {"latitude", "longitude", "last_known_location", "token_hash", "device_token", token}
    assert forbidden_keys.isdisjoint(body.keys())
    assert forbidden_keys.isdisjoint(str(v) for v in body.values())
    assert body["has_location"] is True


# ---------------------------------------------------------------------------
# Call for help
# ---------------------------------------------------------------------------

async def test_call_for_help_returns_200_and_logs_alert(app, db):
    emergency_device_id = "emg-call-help"
    token = "token-call-help"
    await enable_sharing(app, emergency_device_id, token)

    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/call-for-help",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["alert_id"]

    stored = await db.emergency_alerts.find_one({"emergency_device_id": emergency_device_id})
    assert stored is not None
    assert stored["alert_type"] == "call_for_help"


async def test_call_for_help_unenrolled_device_returns_200_logs_alert_with_no_location_creates_no_record(app, db):
    emergency_device_id = "emg-call-help-unenrolled"

    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/call-for-help",
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True

    # Alert is recorded with location=None
    stored = await db.emergency_alerts.find_one({"emergency_device_id": emergency_device_id})
    assert stored is not None
    assert stored["location"] is None

    # No emergency_settings enrollment record created
    settings_doc = await db.emergency_settings.find_one({"emergency_device_id": emergency_device_id})
    assert settings_doc is None


async def test_call_for_help_invalid_token_returns_200_logs_alert_with_no_location(app, db):
    emergency_device_id = "emg-call-help-bad-token"
    token = "token-call-help-good"
    await enable_sharing(app, emergency_device_id, token)

    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/call-for-help",
            headers={"X-Device-Token": "wrong-token"},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True

    stored = await db.emergency_alerts.find_one({"emergency_device_id": emergency_device_id})
    assert stored is not None
    assert stored["location"] is None


async def test_call_for_help_stores_location_only_when_sharing_enabled(app, db):
    sharing_device = "emg-help-sharing-on"
    sharing_token = "token-help-sharing-on"
    await enable_sharing(app, sharing_device, sharing_token)

    no_sharing_device = "emg-help-sharing-off"
    no_sharing_token = "token-help-sharing-off"
    async with await client_for(app) as client:
        await client.post(
            f"/api/emergency/settings/{no_sharing_device}",
            headers={"X-Device-Token": no_sharing_token},
            json={"location_sharing_enabled": False},
        )

        resp_on = await client.post(
            "/api/emergency/call-for-help",
            headers={"X-Device-Token": sharing_token},
            json={"emergency_device_id": sharing_device, "location": NYC},
        )
        resp_off = await client.post(
            "/api/emergency/call-for-help",
            headers={"X-Device-Token": no_sharing_token},
            json={"emergency_device_id": no_sharing_device, "location": NYC},
        )
    assert resp_on.status_code == 200
    assert resp_off.status_code == 200

    stored_on = await db.emergency_alerts.find_one({"emergency_device_id": sharing_device})
    stored_off = await db.emergency_alerts.find_one({"emergency_device_id": no_sharing_device})
    assert stored_on["location"] is not None
    assert stored_off["location"] is None


# ---------------------------------------------------------------------------
# Alert nearby riders
# ---------------------------------------------------------------------------

async def test_alert_nearby_riders_400_when_sharing_disabled(app):
    emergency_device_id = "emg-sharing-disabled"
    token = "token-sharing-disabled"
    async with await client_for(app) as client:
        await client.post(
            f"/api/emergency/settings/{emergency_device_id}",
            headers={"X-Device-Token": token},
            json={"location_sharing_enabled": False},
        )
        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert resp.status_code == 400


async def test_alert_nearby_riders_401_when_not_enrolled(app):
    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"emergency_device_id": "emg-no-settings-doc", "location": NYC},
        )
    assert resp.status_code == 401


async def test_alert_nearby_riders_cooldown_then_success(app):
    emergency_device_id = "emg-cooldown"
    token = "token-cooldown"
    await enable_sharing(app, emergency_device_id, token)

    async with await client_for(app) as client:
        first = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
        assert first.status_code == 200

        second = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
        assert second.status_code == 429


async def test_alert_nearby_riders_200_after_cooldown_elapsed(app, db):
    emergency_device_id = "emg-cooldown-elapsed"
    token = "token-cooldown-elapsed"
    await enable_sharing(app, emergency_device_id, token)

    async with await client_for(app) as client:
        first = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
        assert first.status_code == 200

        # Simulate the cooldown having elapsed by rewinding the recorded timestamp.
        await db.emergency_alert_cooldowns.update_one(
            {"emergency_device_id": emergency_device_id},
            {"$set": {"last_alert_at": datetime.utcnow() - timedelta(minutes=6)}},
        )

        second = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert second.status_code == 200


async def test_alert_nearby_riders_message_does_not_claim_notified(app):
    emergency_device_id = "emg-message-check"
    token = "token-message-check"
    await enable_sharing(app, emergency_device_id, token)

    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "notified" not in body["message"].lower()
    assert "unverified" in body["message"].lower()
    assert "alerted_count" in body
    assert "alert_id" in body


async def test_alert_nearby_riders_radius_and_exclusions(app):
    sender, sender_token = "emg-sender", "token-sender"
    nearby, nearby_token = "emg-nearby", "token-nearby"
    far, far_token = "emg-far", "token-far"
    no_notifications, no_notifications_token = "emg-no-notifications", "token-no-notifications"
    sharing_off, sharing_off_token = "emg-sharing-off-excluded", "token-sharing-off-excluded"

    await enable_sharing(app, sender, sender_token)
    await enable_sharing(app, nearby, nearby_token, location=NEARBY_RIDER)
    await enable_sharing(app, far, far_token, location=FAR_RIDER)
    await enable_sharing(app, no_notifications, no_notifications_token, location=NYC, allow_notifications=False)
    await enable_sharing(app, sharing_off, sharing_off_token, location=NYC)
    # Turn sharing back off for the last device, keeping allow_notifications True.
    async with await client_for(app) as client:
        await client.post(
            f"/api/emergency/settings/{sharing_off}",
            headers={"X-Device-Token": sharing_off_token},
            json={"location_sharing_enabled": False},
        )

        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": sender_token},
            json={"emergency_device_id": sender, "location": NYC},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["alerted_count"] == 1


# ---------------------------------------------------------------------------
# Takeover regression: knowing the general device_id must not grant emergency access
# ---------------------------------------------------------------------------

async def test_general_device_id_cannot_authenticate_emergency_endpoints(app, db):
    """A share-code holder learns the general device_id via GET /api/shared/{share_code}.
    That value must be useless against the emergency endpoints, which key on the separate,
    never-exposed emergency_device_id — and /api/shared never returns it."""
    general_device_id = "device-general-12345"

    calculation_payload = {
        "device_id": general_device_id,
        "name": "Big Jump",
        "calculation": {
            "input_data": {
                "ramp_height": 3,
                "ramp_angle": 30,
                "gap_distance": 20,
                "bike_weight": 250,
                "rider_weight": 180,
                "landing_height": 0,
                "unit_system": "imperial",
            },
            "required_speed_mph": 25,
            "required_speed_kph": 40,
            "required_speed_fps": 36,
            "total_weight_lbs": 430,
            "total_weight_kg": 195,
            "flight_time_seconds": 1.2,
            "max_height_feet": 5,
            "max_height_meters": 1.5,
            "safety_speed_mph": 29,
            "safety_speed_kph": 46,
            "landing_velocity_mph": 20,
            "landing_velocity_kph": 32,
        },
        "share": True,
    }

    # The rider also has real emergency settings, enrolled under a *different*,
    # never-exposed emergency_device_id.
    real_emergency_id = "emg-real-rider-identity"
    real_token = "real-rider-secret"
    await enable_sharing(app, real_emergency_id, real_token)

    async with await client_for(app) as client:
        save_resp = await client.post("/api/save-calculation", json=calculation_payload)
        assert save_resp.status_code == 200, save_resp.text
        saved = save_resp.json()
        share_code = saved["share_code"]
        assert saved["device_id"] == general_device_id

        shared_resp = await client.get(f"/api/shared/{share_code}")
        assert shared_resp.status_code == 200
        shared_body = shared_resp.json()
        assert shared_body["device_id"] == general_device_id
        # The emergency identifier must never appear in a shared-calculation response.
        assert "emergency_device_id" not in shared_body
        assert real_emergency_id not in str(shared_body)

        # Using the leaked general device_id as an emergency_device_id guess returns
        # only default public settings for an unenrolled ID, never the rider's real
        # enrolled settings (which have location sharing on).
        auth_resp = await client.get(
            f"/api/emergency/settings/{general_device_id}",
            headers={"X-Device-Token": real_token},
        )
        assert auth_resp.status_code == 200
        assert auth_resp.json()["location_sharing_enabled"] is False
        assert auth_resp.json()["has_location"] is False

        auth_resp_real = await client.get(
            f"/api/emergency/settings/{real_emergency_id}",
            headers={"X-Device-Token": real_token},
        )
        assert auth_resp_real.status_code == 200
        assert auth_resp_real.json()["location_sharing_enabled"] is True


# ---------------------------------------------------------------------------
# Legacy rows: never claimable, excluded from nearby matching
# ---------------------------------------------------------------------------

async def test_legacy_row_cannot_be_claimed_via_old_device_id(app, db):
    legacy_device_id = "legacy-rider-device-id"
    await db.emergency_settings.insert_one(
        {
            "device_id": legacy_device_id,
            "allow_notifications": True,
            "location_sharing_enabled": True,
            "alert_cooldown_ms": 300000,
            "last_known_location": {"latitude": 40.7128, "longitude": -74.0060},
        }
    )

    async with await client_for(app) as client:
        # Any attacker (or the original rider) trying to query settings with the legacy
        # row's old device_id value gets default unenrolled settings (has_location is False)
        # rather than authenticated access to the legacy document (which has a location).
        get_resp = await client.get(
            f"/api/emergency/settings/{legacy_device_id}",
            headers={"X-Device-Token": "any-token"},
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["has_location"] is False
        assert get_resp.json()["location_sharing_enabled"] is False

        # A first "enrollment" attempt using that same string as emergency_device_id
        # creates a brand-new, independent record (proving the legacy row itself was never
        # touched/claimed) rather than taking over the legacy document's data.
        enroll_resp = await client.post(
            f"/api/emergency/settings/{legacy_device_id}",
            headers={"X-Device-Token": "brand-new-secret"},
            json={},
        )
        assert enroll_resp.status_code == 200
        assert enroll_resp.json()["has_location"] is False

    legacy_doc = await db.emergency_settings.find_one({"device_id": legacy_device_id})
    assert legacy_doc is not None
    assert "emergency_device_id" not in legacy_doc
    assert legacy_doc["last_known_location"] == {"latitude": 40.7128, "longitude": -74.0060}


async def test_legacy_row_excluded_from_nearby_matching_and_location_purged(app, db):
    # Same module object conftest.py's `app`/`db` fixtures already imported and
    # monkeypatched (sys.modules caches by name), so calling create_indexes() here runs
    # against the same in-memory `db` used by the rest of this test.
    import server as server_module

    legacy_device_id = "legacy-rider-excluded"
    await db.emergency_settings.insert_one(
        {
            "device_id": legacy_device_id,
            "allow_notifications": True,
            "location_sharing_enabled": True,
            "alert_cooldown_ms": 300000,
            "last_known_location": NYC,
        }
    )

    # The startup hook purges last_known_location from legacy rows (those lacking
    # emergency_device_id); re-run it here since the fixture already ran it once before
    # this row existed.
    await server_module.create_indexes()

    legacy_doc = await db.emergency_settings.find_one({"device_id": legacy_device_id})
    assert "last_known_location" not in legacy_doc

    sender = "emg-sender-vs-legacy"
    token = "token-sender-vs-legacy"
    await enable_sharing(app, sender, token)

    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token},
            json={"emergency_device_id": sender, "location": NYC},
        )
    assert resp.status_code == 200
    # Only the sender itself is enrolled with emergency_device_id/token_hash; the legacy
    # row (no matter how close its stale location is) must never be counted.
    assert resp.json()["alerted_count"] == 0


async def test_startup_drops_legacy_cooldown_index_and_allows_multiple_riders(app, db):
    # Simulate a pre-existing legacy unique index on `device_id` on emergency_alert_cooldowns
    # (created in PR #29 before PR #33 switched keys to emergency_device_id), plus real legacy
    # cooldown documents that predate emergency_device_id. Against the old code, a non-sparse
    # unique index on emergency_device_id would treat both rows' missing field as null and
    # DuplicateKeyError here, aborting startup.
    import server as server_module

    # The `app` fixture already ran create_indexes() once on an empty db, which created the
    # emergency_device_id_1 unique index; drop it here to reproduce the pre-PR #33 state
    # (only the legacy device_id_1 index, no emergency_device_id index yet) before inserting
    # legacy rows that lack emergency_device_id.
    await db.emergency_alert_cooldowns.drop_index("emergency_device_id_1")
    await db.emergency_alert_cooldowns.create_index(
        "device_id", unique=True, name="device_id_1"
    )
    await db.emergency_alert_cooldowns.insert_many(
        [{"device_id": "old-rider-a"}, {"device_id": "old-rider-b"}]
    )
    initial_info = await db.emergency_alert_cooldowns.index_information()
    assert "device_id_1" in initial_info

    # Run create_indexes() - it must drop device_id_1 and purge legacy rows safely, then
    # create emergency_device_id_1, without raising DuplicateKeyError.
    await server_module.create_indexes()

    indexes_after = await db.emergency_alert_cooldowns.index_information()
    assert "device_id_1" not in indexes_after
    assert "emergency_device_id_1" in indexes_after
    assert await db.emergency_alert_cooldowns.count_documents({}) == 0

    # Safe to run again (idempotent on subsequent restarts)
    await server_module.create_indexes()

    # Two DIFFERENT emergency devices can both send an alert without colliding on null device_id
    rider_a = "emg-rider-cooldown-a"
    token_a = "token-rider-cooldown-a"
    rider_b = "emg-rider-cooldown-b"
    token_b = "token-rider-cooldown-b"

    await enable_sharing(app, rider_a, token_a)
    await enable_sharing(app, rider_b, token_b)

    async with await client_for(app) as client:
        # Rider A sends alert -> 200
        resp_a1 = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token_a},
            json={"emergency_device_id": rider_a, "location": NYC},
        )
        assert resp_a1.status_code == 200

        # Rider B sends alert -> 200 (if legacy device_id index remained, null collision would cause 429)
        resp_b1 = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token_b},
            json={"emergency_device_id": rider_b, "location": NYC},
        )
        assert resp_b1.status_code == 200

        # Rider A sends another alert immediately within cooldown -> 429
        resp_a2 = await client.post(
            "/api/emergency/alert-nearby-riders",
            headers={"X-Device-Token": token_a},
            json={"emergency_device_id": rider_a, "location": NYC},
        )
        assert resp_a2.status_code == 429


async def test_startup_tolerates_index_not_found_error_on_drop(app, db, monkeypatch):
    """An index-not-found-style OperationFailure raised while dropping the legacy index
    (e.g. a race where another instance already dropped it) must not abort startup."""
    import server as server_module
    from pymongo.errors import OperationFailure

    await db.emergency_alert_cooldowns.create_index(
        "device_id", unique=True, name="device_id_1"
    )

    collection_cls = type(db.emergency_alert_cooldowns)
    real_drop_index = collection_cls.drop_index

    async def fake_drop_index(self, name, *args, **kwargs):
        if name == "device_id_1":
            raise OperationFailure("index not found with name [device_id_1]", code=27)
        return await real_drop_index(self, name, *args, **kwargs)

    # Patch the collection class (not the instance) because mongomock-motor returns a
    # fresh collection object on every `db.emergency_alert_cooldowns` access, so an
    # instance-level monkeypatch would not be visible inside create_indexes().
    monkeypatch.setattr(collection_cls, "drop_index", fake_drop_index)

    # Must not raise, even though drop_index reports index-not-found.
    await server_module.create_indexes()


async def test_startup_raises_on_non_ignorable_drop_failure(app, db, monkeypatch):
    """A non-"index not found" OperationFailure while dropping the legacy index (e.g. a
    permissions problem) must abort startup loudly instead of leaving the stale unique
    index in place, which would otherwise cause false 429 "please wait" responses."""
    import server as server_module
    from pymongo.errors import OperationFailure

    await db.emergency_alert_cooldowns.create_index(
        "device_id", unique=True, name="device_id_1"
    )

    async def fake_drop_index(self, name, *args, **kwargs):
        raise OperationFailure("not authorized to drop index", code=13)

    # See comment above: patch the collection class, not the instance.
    monkeypatch.setattr(type(db.emergency_alert_cooldowns), "drop_index", fake_drop_index)

    with pytest.raises(OperationFailure):
        await server_module.create_indexes()


# ---------------------------------------------------------------------------
# Call-for-help throttle and retention
# ---------------------------------------------------------------------------

async def test_call_for_help_throttles_repeat_calls_same_device(app, db):
    emergency_device_id = "emg-throttle-a"
    other_device_id = "emg-throttle-b"

    async with await client_for(app) as client:
        resp1 = await client.post(
            "/api/emergency/call-for-help",
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
        resp2 = await client.post(
            "/api/emergency/call-for-help",
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
        resp_other = await client.post(
            "/api/emergency/call-for-help",
            json={"emergency_device_id": other_device_id, "location": NYC},
        )

    # Both repeat calls for the same device still return 200 success...
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["success"] is True
    assert resp2.json()["success"] is True
    # ...but only one row was actually stored for that device within the throttle window.
    assert resp2.json()["alert_id"] == resp1.json()["alert_id"]
    count_same_device = await db.emergency_alerts.count_documents(
        {"emergency_device_id": emergency_device_id, "alert_type": "call_for_help"}
    )
    assert count_same_device == 1

    # A different device's call is stored independently.
    assert resp_other.status_code == 200
    count_other_device = await db.emergency_alerts.count_documents(
        {"emergency_device_id": other_device_id, "alert_type": "call_for_help"}
    )
    assert count_other_device == 1


async def test_call_for_help_logs_again_after_throttle_window_elapses(app, db):
    emergency_device_id = "emg-throttle-elapsed"

    async with await client_for(app) as client:
        resp1 = await client.post(
            "/api/emergency/call-for-help",
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert resp1.status_code == 200

    # Simulate the throttle window having elapsed by rewinding the stored row's timestamp.
    await db.emergency_alerts.update_one(
        {"id": resp1.json()["alert_id"]},
        {"$set": {"timestamp": datetime.utcnow() - timedelta(seconds=60)}},
    )

    async with await client_for(app) as client:
        resp2 = await client.post(
            "/api/emergency/call-for-help",
            json={"emergency_device_id": emergency_device_id, "location": NYC},
        )
    assert resp2.status_code == 200
    assert resp2.json()["alert_id"] != resp1.json()["alert_id"]

    count = await db.emergency_alerts.count_documents(
        {"emergency_device_id": emergency_device_id, "alert_type": "call_for_help"}
    )
    assert count == 2


async def test_emergency_alerts_has_ttl_index_on_timestamp(app, db):
    """Verify the retention TTL index exists with the expected expireAfterSeconds. Note:
    mongomock-motor stores TTL index metadata but does not actually expire documents in the
    background, so this only checks the index definition, not real expiry behavior."""
    import server as server_module

    info = await db.emergency_alerts.index_information()
    assert "timestamp_ttl" in info
    assert info["timestamp_ttl"]["expireAfterSeconds"] == server_module.EMERGENCY_ALERT_RETENTION_SECONDS

    # Idempotent: running create_indexes() again must not raise even though the index
    # already exists with the same options.
    await server_module.create_indexes()
    info_again = await db.emergency_alerts.index_information()
    assert info_again["timestamp_ttl"]["expireAfterSeconds"] == server_module.EMERGENCY_ALERT_RETENTION_SECONDS


# ---------------------------------------------------------------------------
# Haversine distance helper (no app/db needed)
# ---------------------------------------------------------------------------

def test_haversine_identical_points_is_zero():
    from server import haversine_distance_miles

    assert haversine_distance_miles(40.7128, -74.0060, 40.7128, -74.0060) == 0


def test_haversine_known_distance_nyc_to_la():
    from server import haversine_distance_miles

    # NYC to LA is roughly 2,445 miles.
    distance = haversine_distance_miles(40.7128, -74.0060, 34.0522, -118.2437)
    assert 2400 < distance < 2500
