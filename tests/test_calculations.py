import math
import pytest

from backend.server import calculate_jump_speed, generate_trajectory_points


def test_calculate_jump_speed_basic():
    # Typical jump: 30 ft gap, 30 degree ramp
    result = calculate_jump_speed(ramp_angle_deg=30, gap_distance_ft=30, landing_height_diff_ft=0)

    assert isinstance(result, dict)
    assert result["required_speed_fps"] > 0
    assert result["required_speed_mph"] > 0
    assert "trajectory_points" in result
    assert len(result["trajectory_points"]) > 0


def test_calculate_jump_speed_landing_height():
    # When landing height is positive (landing higher), required speed may differ
    res_low = calculate_jump_speed(ramp_angle_deg=30, gap_distance_ft=30, landing_height_diff_ft=0)
    res_high = calculate_jump_speed(ramp_angle_deg=30, gap_distance_ft=30, landing_height_diff_ft=5)

    assert res_low["required_speed_fps"] > 0
    assert res_high["required_speed_fps"] > 0
    # It's reasonable that landing higher reduces required horizontal speed in many cases
    assert isinstance(res_low["required_speed_fps"], float)
    assert isinstance(res_high["required_speed_fps"], float)


def test_calculate_jump_speed_invalid_angle_raises():
    # Angle that makes denominator invalid (e.g., 90 degrees) should raise ValueError
    with pytest.raises(ValueError):
        calculate_jump_speed(ramp_angle_deg=90, gap_distance_ft=10, landing_height_diff_ft=0)


def test_generate_trajectory_points_consistency():
    v_fps = 30.0
    theta_rad = math.radians(30)
    gap = 20.0

    points = generate_trajectory_points(v_fps, theta_rad, gap)
    assert isinstance(points, list)
    assert all("x" in p.__dict__ and "y" in p.__dict__ for p in points)
    # first point should be at x=0
    assert points[0].x == 0 or pytest.approx(points[0].x, rel=1e-2) == 0
    # times should be non-decreasing
    times = [p.time for p in points]
    assert times == sorted(times)
