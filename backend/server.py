from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import math


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


# Jump Calculation Models
class JumpCalculationInput(BaseModel):
    ramp_height: float = Field(..., description="Ramp height in feet")
    ramp_angle: float = Field(..., description="Ramp angle in degrees")
    gap_distance: float = Field(..., description="Gap distance to clear in feet")
    bike_weight: float = Field(..., description="Dirt bike weight in pounds")
    rider_weight: float = Field(..., description="Rider body weight in pounds")
    landing_height: Optional[float] = Field(default=0, description="Landing ramp height difference in feet (negative if lower)")
    unit_system: Optional[str] = Field(default="imperial", description="Unit system: 'imperial' or 'metric'")

class JumpCalculationResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    input_data: JumpCalculationInput
    required_speed_mph: float
    required_speed_kph: float
    required_speed_fps: float
    total_weight_lbs: float
    total_weight_kg: float
    flight_time_seconds: float
    max_height_feet: float
    max_height_meters: float
    safety_speed_mph: float  # 15% safety margin
    safety_speed_kph: float
    landing_velocity_mph: float
    landing_velocity_kph: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    warnings: List[str] = []


def calculate_jump_speed(
    ramp_angle_deg: float,
    gap_distance_ft: float,
    landing_height_diff_ft: float = 0
) -> dict:
    """
    Calculate the required speed to clear a gap using projectile motion physics.
    
    The formula is derived from:
    - Horizontal: x = v * cos(θ) * t
    - Vertical: y = v * sin(θ) * t - 0.5 * g * t²
    
    Solving for initial velocity:
    v = sqrt((g * x²) / (2 * cos²(θ) * (x * tan(θ) - y)))
    
    Where:
    - v = initial velocity
    - g = gravitational acceleration (32.174 ft/s²)
    - x = horizontal distance (gap)
    - θ = launch angle
    - y = vertical displacement (landing height difference)
    """
    # Constants
    g = 32.174  # ft/s² (gravitational acceleration)
    
    # Convert angle to radians
    theta = math.radians(ramp_angle_deg)
    
    # Gap distance in feet
    x = gap_distance_ft
    
    # Landing height difference (positive if landing is higher, negative if lower)
    y = landing_height_diff_ft
    
    # Calculate the denominator
    cos_theta = math.cos(theta)
    tan_theta = math.tan(theta)
    
    # Using the projectile range formula with height difference
    # v = sqrt((g * x²) / (2 * cos²(θ) * (x * tan(θ) - y)))
    denominator = 2 * (cos_theta ** 2) * (x * tan_theta - y)
    
    if denominator <= 0:
        # This means the angle is too steep or landing is too high
        # Fall back to basic range formula without height difference
        denominator = math.sin(2 * theta)
        if denominator <= 0:
            raise ValueError("Invalid angle: cannot compute trajectory")
        v_fps = math.sqrt((x * g) / denominator)
    else:
        v_fps = math.sqrt((g * x * x) / denominator)
    
    # Convert to mph and kph
    v_mph = v_fps * 0.681818  # ft/s to mph
    v_kph = v_fps * 1.09728   # ft/s to km/h
    
    # Calculate flight time
    # t = x / (v * cos(θ))
    flight_time = x / (v_fps * cos_theta) if v_fps * cos_theta > 0 else 0
    
    # Calculate max height reached
    # h_max = (v * sin(θ))² / (2 * g)
    v_vertical = v_fps * math.sin(theta)
    max_height = (v_vertical ** 2) / (2 * g)
    
    # Calculate landing velocity (total velocity at landing)
    # Using conservation of energy: v_landing = sqrt(v² + 2*g*y)
    landing_v_fps = math.sqrt(v_fps ** 2 - 2 * g * y) if (v_fps ** 2 - 2 * g * y) > 0 else v_fps
    landing_v_mph = landing_v_fps * 0.681818
    landing_v_kph = landing_v_fps * 1.09728
    
    return {
        "required_speed_fps": round(v_fps, 2),
        "required_speed_mph": round(v_mph, 2),
        "required_speed_kph": round(v_kph, 2),
        "flight_time_seconds": round(flight_time, 2),
        "max_height_feet": round(max_height, 2),
        "max_height_meters": round(max_height * 0.3048, 2),
        "landing_velocity_mph": round(landing_v_mph, 2),
        "landing_velocity_kph": round(landing_v_kph, 2)
    }


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Dirt Bike Jump Calculator API"}

@api_router.post("/calculate-jump", response_model=JumpCalculationResult)
async def calculate_jump(input_data: JumpCalculationInput):
    """Calculate the required speed to clear a gap on a dirt bike."""
    warnings = []
    
    # Validate inputs
    if input_data.ramp_angle <= 0 or input_data.ramp_angle >= 90:
        raise ValueError("Ramp angle must be between 0 and 90 degrees")
    
    if input_data.gap_distance <= 0:
        raise ValueError("Gap distance must be positive")
    
    # Calculate total weight
    total_weight_lbs = input_data.bike_weight + input_data.rider_weight
    total_weight_kg = total_weight_lbs * 0.453592
    
    # Add weight-based warnings
    if total_weight_lbs > 500:
        warnings.append("Heavy combined weight may affect suspension and landing. Consider adjusting suspension settings.")
    
    # Convert to imperial if needed
    gap_distance_ft = input_data.gap_distance
    landing_height_ft = input_data.landing_height or 0
    
    if input_data.unit_system == "metric":
        gap_distance_ft = input_data.gap_distance * 3.28084  # meters to feet
        landing_height_ft = (input_data.landing_height or 0) * 3.28084
    
    # Calculate jump physics
    try:
        result = calculate_jump_speed(
            ramp_angle_deg=input_data.ramp_angle,
            gap_distance_ft=gap_distance_ft,
            landing_height_diff_ft=landing_height_ft
        )
    except ValueError as e:
        raise ValueError(str(e))
    
    # Calculate safety speed (15% margin)
    safety_factor = 1.15
    safety_speed_mph = round(result["required_speed_mph"] * safety_factor, 2)
    safety_speed_kph = round(result["required_speed_kph"] * safety_factor, 2)
    
    # Add safety warnings
    if result["required_speed_mph"] > 60:
        warnings.append("⚠️ High speed required! This is an advanced jump. Ensure proper safety gear and experience.")
    
    if input_data.ramp_angle > 45:
        warnings.append("⚠️ Steep ramp angle may cause instability during takeoff.")
    
    if input_data.ramp_angle < 15:
        warnings.append("⚠️ Low ramp angle requires higher speed and longer landing zone.")
    
    if result["landing_velocity_mph"] > 50:
        warnings.append("⚠️ High landing velocity. Ensure proper landing ramp and suspension setup.")
    
    # Create result object
    calculation_result = JumpCalculationResult(
        input_data=input_data,
        required_speed_mph=result["required_speed_mph"],
        required_speed_kph=result["required_speed_kph"],
        required_speed_fps=result["required_speed_fps"],
        total_weight_lbs=round(total_weight_lbs, 2),
        total_weight_kg=round(total_weight_kg, 2),
        flight_time_seconds=result["flight_time_seconds"],
        max_height_feet=result["max_height_feet"],
        max_height_meters=result["max_height_meters"],
        safety_speed_mph=safety_speed_mph,
        safety_speed_kph=safety_speed_kph,
        landing_velocity_mph=result["landing_velocity_mph"],
        landing_velocity_kph=result["landing_velocity_kph"],
        warnings=warnings
    )
    
    # Save to database for history
    await db.jump_calculations.insert_one(calculation_result.dict())
    
    return calculation_result

@api_router.get("/calculation-history", response_model=List[JumpCalculationResult])
async def get_calculation_history(limit: int = 10):
    """Get recent jump calculations."""
    calculations = await db.jump_calculations.find().sort("timestamp", -1).limit(limit).to_list(limit)
    return [JumpCalculationResult(**calc) for calc in calculations]

@api_router.delete("/calculation-history")
async def clear_calculation_history():
    """Clear all calculation history."""
    result = await db.jump_calculations.delete_many({})
    return {"message": f"Deleted {result.deleted_count} calculations"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
