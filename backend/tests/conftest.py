"""Pytest configuration and fixtures."""
import pytest
from fastapi.testclient import TestClient
# Uncomment when server.py is importable
# from backend.server import app


@pytest.fixture
def client():
    """Create a test client for FastAPI."""
    # return TestClient(app)
    pass


@pytest.fixture
def sample_calculation_input():
    """Sample jump calculation input."""
    return {
        "ramp_height": 5.0,
        "ramp_angle": 30.0,
        "gap_distance": 50.0,
        "bike_weight": 220.0,
        "rider_weight": 165.0,
        "landing_height": 0.0,
        "unit_system": "imperial",
    }
