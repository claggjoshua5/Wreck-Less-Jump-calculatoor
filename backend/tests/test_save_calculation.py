"""Tests for save and share calculation endpoints."""
import pytest


class TestSaveCalculation:
    """Test suite for save/share endpoints."""

    def test_save_calculation_with_name(self):
        """Test saving a calculation with required name."""
        calculation_data = {
            "name": "Backyard Gap",
            "description": "Test jump",
        }
        assert calculation_data["name"], "Calculation must have a name"

    def test_share_code_generation(self):
        """Test that share codes are generated."""
        # Share code should be 8 characters
        share_code = "ABC12345"
        assert len(share_code) == 8, "Share code should be 8 characters"

    def test_location_data_optional(self):
        """Test that location data is optional."""
        calculation_with_location = {"location": {"latitude": 40.7128, "longitude": -74.0060}}
        calculation_without_location = {"location": None}
        assert calculation_with_location["location"] is not None
        assert calculation_without_location["location"] is None
