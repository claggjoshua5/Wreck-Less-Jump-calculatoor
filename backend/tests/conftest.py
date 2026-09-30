"""Shared pytest fixtures for backend tests.

The production ``emergentintegrations`` package (Stripe checkout helper) is a private
dependency that isn't published anywhere pytest can install it from, and isn't needed to
exercise the emergency-alert endpoints under test here. We register a minimal stub module
before importing ``backend.server`` so the import succeeds; nothing in these tests exercises
the payment/Stripe code paths.
"""
import os
import sys
import types

import pytest
import pytest_asyncio


def _install_emergentintegrations_stub():
    if "emergentintegrations" in sys.modules:
        return

    root = types.ModuleType("emergentintegrations")
    payments = types.ModuleType("emergentintegrations.payments")
    stripe = types.ModuleType("emergentintegrations.payments.stripe")
    checkout = types.ModuleType("emergentintegrations.payments.stripe.checkout")

    class _Unused:
        def __init__(self, *args, **kwargs):
            pass

    checkout.StripeCheckout = _Unused
    checkout.CheckoutSessionResponse = _Unused
    checkout.CheckoutStatusResponse = _Unused
    checkout.CheckoutSessionRequest = _Unused

    root.payments = payments
    payments.stripe = stripe
    stripe.checkout = checkout

    sys.modules["emergentintegrations"] = root
    sys.modules["emergentintegrations.payments"] = payments
    sys.modules["emergentintegrations.payments.stripe"] = stripe
    sys.modules["emergentintegrations.payments.stripe.checkout"] = checkout


_install_emergentintegrations_stub()

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mongomock_motor import AsyncMongoMockClient  # noqa: E402

import server  # noqa: E402


@pytest_asyncio.fixture
async def app():
    """The FastAPI app, with an isolated in-memory Mongo database per test."""
    mock_client = AsyncMongoMockClient()
    mock_db = mock_client["test_db"]
    server.db = mock_db
    await server.create_indexes()
    yield server.app


@pytest_asyncio.fixture
async def db(app):
    return server.db
