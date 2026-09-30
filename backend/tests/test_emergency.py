"""Tests for the emergency-alert endpoints in backend/server.py.

Uses httpx's ASGI transport against the FastAPI app, backed by an in-memory
mongomock-motor database so no real MongoDB instance is required.
"""

import asyncio
import math
from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

import server

NYC = {"latitude": 40.7128, "longitude": -74.0060}
# ~4.9 miles north of NYC (1 degree latitude ~= 69 miles).
NEARBY_RIDER = {"latitude": 40.7128 + (4.9 / 69.0), "longitude": -74.0060}
# ~5.1 miles north of NYC.
FAR_RIDER = {"latitude": 40.7128 + (5.1 / 69.0), "longitude": -74.0060}


async def client_for(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def enable_sharing(app, device_id, location=NYC, allow_notifications=True):
    async with await client_for(app) as client:
        resp = await client.post(
            f"/api/emergency/settings/{device_id}",
            json={
                "location_sharing_enabled": True,
                "allow_notifications": allow_notifications,
                "location": location,
            },
        )
        assert resp.status_code == 200, resp.text
        return resp.json()


# ---------------------------------------------------------------------------
# Settings endpoint
# ---------------------------------------------------------------------------

async def test_get_settings_unknown_device_returns_defaults(app):
    async with await client_for(app) as client:
        resp = await client.get("/api/emergency/settings/unknown-device")
    assert resp.status_code == 200
    body = resp.json()
    assert body["device_id"] == "unknown-device"
    assert body["location_sharing_enabled"] is False
    assert body["allow_notifications"] is True
    assert body["last_known_location"] is None


async def test_post_settings_sharing_off_clears_location(app):
    device_id = "device-clear-location"
    await enable_sharing(app, device_id)

    async with await client_for(app) as client:
        resp = await client.post(
            f"/api/emergency/settings/{device_id}",
            json={"location_sharing_enabled": False},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["location_sharing_enabled"] is False
    assert body["last_known_location"] is None


async def test_post_settings_location_ignored_when_sharing_off(app):
    device_id = "device-ignore-location"
    async with await client_for(app) as client:
        resp = await client.post(
            f"/api/emergency/settings/{device_id}",
            json={"location_sharing_enabled": False, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["last_known_location"] is None


async def test_blank_device_id_returns_400(app):
    async with await client_for(app) as client:
        resp = await client.get("/api/emergency/settings/%20")
    assert resp.status_code == 400


async def test_out_of_range_coordinates_return_422(app):
    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/settings/some-device",
            json={
                "location_sharing_enabled": True,
                "location": {"latitude": 999, "longitude": -74.0060},
            },
        )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Call for help
# ---------------------------------------------------------------------------

async def test_call_for_help_returns_200_and_logs_alert(app, db):
    device_id = "device-call-help"
    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/call-for-help",
            json={"device_id": device_id, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["alert_id"]

    stored = await db.emergency_alerts.find_one({"device_id": device_id})
    assert stored is not None
    assert stored["alert_type"] == "call_for_help"


async def test_call_for_help_stores_location_only_when_sharing_enabled(app, db):
    sharing_device = "device-help-sharing-on"
    await enable_sharing(app, sharing_device)
    no_sharing_device = "device-help-sharing-off"

    async with await client_for(app) as client:
        resp_on = await client.post(
            "/api/emergency/call-for-help",
            json={"device_id": sharing_device, "location": NYC},
        )
        resp_off = await client.post(
            "/api/emergency/call-for-help",
            json={"device_id": no_sharing_device, "location": NYC},
        )
    assert resp_on.status_code == 200
    assert resp_off.status_code == 200

    stored_on = await db.emergency_alerts.find_one({"device_id": sharing_device})
    stored_off = await db.emergency_alerts.find_one({"device_id": no_sharing_device})
    assert stored_on["location"] is not None
    assert stored_off["location"] is None


# ---------------------------------------------------------------------------
# Alert nearby riders
# ---------------------------------------------------------------------------

async def test_alert_nearby_riders_400_when_sharing_disabled(app):
    device_id = "device-sharing-disabled"
    async with await client_for(app) as client:
        await client.post(
            f"/api/emergency/settings/{device_id}",
            json={"location_sharing_enabled": False},
        )
        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
    assert resp.status_code == 400


async def test_alert_nearby_riders_400_when_no_settings_doc(app):
    device_id = "device-no-settings-doc"
    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
    assert resp.status_code == 400


async def test_alert_nearby_riders_cooldown_then_success(app):
    device_id = "device-cooldown"
    await enable_sharing(app, device_id)

    async with await client_for(app) as client:
        first = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
        assert first.status_code == 200

        second = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
        assert second.status_code == 429


async def test_alert_nearby_riders_200_after_cooldown_elapsed(app, db):
    device_id = "device-cooldown-elapsed"
    await enable_sharing(app, device_id)

    async with await client_for(app) as client:
        first = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
        assert first.status_code == 200

        # Simulate the cooldown having elapsed by rewinding the recorded timestamp.
        await db.emergency_alert_cooldowns.update_one(
            {"device_id": device_id},
            {"$set": {"last_alert_at": datetime.utcnow() - timedelta(minutes=6)}},
        )

        second = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
    assert second.status_code == 200


async def test_alert_nearby_riders_concurrent_requests_use_one_cooldown(app):
    device_id = "device-concurrent-alert"
    await enable_sharing(app, device_id)

    async with await client_for(app) as client:
        responses = await asyncio.gather(
            *[
                client.post(
                    "/api/emergency/alert-nearby-riders",
                    json={"device_id": device_id, "location": NYC},
                )
                for _ in range(2)
            ]
        )

    # mongomock-motor may not reproduce MongoDB's upsert race; preserve the
    # expected behavior assertion without weakening production logic.
    assert sorted(response.status_code for response in responses) == [200, 429]


@pytest.mark.parametrize("with_previous_cooldown", [False, True])
async def test_alert_nearby_riders_rolls_back_cooldown_on_failure(
    app, db, monkeypatch, with_previous_cooldown
):
    device_id = f"device-cooldown-rollback-{with_previous_cooldown}"
    await enable_sharing(app, device_id)
    previous_timestamp = datetime.utcnow().replace(microsecond=0)
    previous_timestamp -= timedelta(minutes=6)
    cooldown_records = db.emergency_alert_cooldowns
    if with_previous_cooldown:
        await cooldown_records.insert_one(
            {"device_id": device_id, "last_alert_at": previous_timestamp}
        )

    collection = server.db.emergency_alerts
    monkeypatch.setattr(server.db, "emergency_alerts", collection)
    original_insert_one = collection.insert_one

    async def fail_insert_one(*args, **kwargs):
        raise RuntimeError("simulated emergency alert write failure")

    monkeypatch.setattr(collection, "insert_one", fail_insert_one)
    transport = ASGITransport(
        app=app,
        raise_app_exceptions=False,
    )
    request_client = AsyncClient(transport=transport, base_url="http://test")
    async with request_client as client:
        failed = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
    assert failed.status_code == 500

    rolled_back = await cooldown_records.find_one({"device_id": device_id})
    if with_previous_cooldown:
        assert rolled_back["last_alert_at"] == previous_timestamp
    else:
        assert rolled_back is None

    monkeypatch.setattr(collection, "insert_one", original_insert_one)
    async with await client_for(app) as client:
        retry = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
    assert retry.status_code == 200


async def test_alert_nearby_riders_message_does_not_claim_notified(app):
    device_id = "device-message-check"
    await enable_sharing(app, device_id)

    async with await client_for(app) as client:
        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": device_id, "location": NYC},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "notified" not in body["message"].lower()
    assert "unverified" in body["message"].lower()
    assert "alerted_count" in body
    assert "alert_id" in body


async def test_alert_nearby_riders_radius_and_exclusions(app):
    sender = "device-sender"
    nearby = "device-nearby"
    far = "device-far"
    no_notifications = "device-no-notifications"
    sharing_off = "device-sharing-off-excluded"

    await enable_sharing(app, sender)
    await enable_sharing(app, nearby, location=NEARBY_RIDER)
    await enable_sharing(app, far, location=FAR_RIDER)
    await enable_sharing(app, no_notifications, location=NYC, allow_notifications=False)
    await enable_sharing(app, sharing_off, location=NYC)
    # Turn sharing back off for the last device, keeping allow_notifications True.
    async with await client_for(app) as client:
        await client.post(
            f"/api/emergency/settings/{sharing_off}",
            json={"location_sharing_enabled": False},
        )

        resp = await client.post(
            "/api/emergency/alert-nearby-riders",
            json={"device_id": sender, "location": NYC},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["alerted_count"] == 1


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


def test_bounding_box_is_symmetric_and_uses_expected_latitude_delta():
    from server import bounding_box

    lat, lon, radius = 40.0, -73.0, 5.0
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius)

    assert (min_lat + max_lat) / 2 == pytest.approx(lat)
    assert (min_lon + max_lon) / 2 == pytest.approx(lon)
    assert max_lat - lat == pytest.approx(radius / 69.0)
    expected_lon_delta = radius / (69.0 * math.cos(math.radians(lat)))
    assert max_lon - lon == pytest.approx(expected_lon_delta)


def test_bounding_box_longitude_delta_widens_at_higher_latitudes():
    from server import bounding_box

    equator_box = bounding_box(0.0, 0.0, 5.0)
    high_latitude_box = bounding_box(60.0, 0.0, 5.0)

    equator_width = equator_box[3] - equator_box[2]
    high_latitude_width = high_latitude_box[3] - high_latitude_box[2]
    assert high_latitude_width > equator_width


def test_bounding_box_clamps_at_coordinate_limits():
    from server import bounding_box

    north_east = bounding_box(89.99, 179.99, 5.0)
    south_west = bounding_box(-89.99, -179.99, 5.0)

    assert north_east[1] == 90.0
    assert north_east[3] == 180.0
    assert south_west[0] == -90.0
    assert south_west[2] == -180.0


def test_bounding_box_contains_points_five_miles_away_in_cardinal_directions():
    from server import bounding_box

    lat, lon, radius = 40.7128, -74.0060, 5.0
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius)
    latitude_offset = math.degrees(radius / 3958.8)
    longitude_offset = latitude_offset / math.cos(math.radians(lat))

    assert min_lat <= lat + latitude_offset <= max_lat
    assert min_lat <= lat - latitude_offset <= max_lat
    assert min_lon <= lon + longitude_offset <= max_lon
    assert min_lon <= lon - longitude_offset <= max_lon
