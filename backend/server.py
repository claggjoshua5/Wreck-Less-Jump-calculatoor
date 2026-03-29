from fastapi import FastAPI, APIRouter, HTTPException
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


# Location Model
class LocationData(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None


# Jump Calculation Models
class JumpCalculationInput(BaseModel):
    ramp_height: float = Field(..., description="Ramp height in feet")
    ramp_angle: float = Field(..., description="Ramp angle in degrees")
    gap_distance: float = Field(..., description="Gap distance to clear in feet")
    bike_weight: float = Field(..., description="Dirt bike weight in pounds")
    rider_weight: float = Field(..., description="Rider body weight in pounds")
    landing_height: Optional[float] = Field(default=0, description="Landing ramp height difference in feet (negative if lower)")
    unit_system: Optional[str] = Field(default="imperial", description="Unit system: 'imperial' or 'metric'")


class TrajectoryPoint(BaseModel):
    x: float
    y: float
    time: float


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
    safety_speed_mph: float
    safety_speed_kph: float
    landing_velocity_mph: float
    landing_velocity_kph: float
    trajectory_points: List[TrajectoryPoint] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    warnings: List[str] = []


class SavedCalculation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    calculation: JumpCalculationResult
    location: Optional[LocationData] = None
    is_shared: bool = False
    share_code: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SaveCalculationRequest(BaseModel):
    name: str
    description: Optional[str] = None
    calculation: JumpCalculationResult
    location: Optional[LocationData] = None
    share: bool = False


class ShareCalculationRequest(BaseModel):
    calculation_id: str


def generate_trajectory_points(
    v_fps: float,
    theta_rad: float,
    gap_distance_ft: float,
    landing_height_diff_ft: float = 0
) -> List[TrajectoryPoint]:
    """Generate trajectory points for visualization."""
    g = 32.174  # ft/s²
    points = []
    
    cos_theta = math.cos(theta_rad)
    sin_theta = math.sin(theta_rad)
    
    # Calculate total flight time
    vx = v_fps * cos_theta
    vy = v_fps * sin_theta
    
    if vx <= 0:
        return points
    
    total_time = gap_distance_ft / vx
    
    # Generate 50 points along the trajectory
    num_points = 50
    for i in range(num_points + 1):
        t = (i / num_points) * total_time
        x = vx * t
        y = vy * t - 0.5 * g * t * t
        points.append(TrajectoryPoint(x=round(x, 2), y=round(y, 2), time=round(t, 3)))
    
    return points


def calculate_jump_speed(
    ramp_angle_deg: float,
    gap_distance_ft: float,
    landing_height_diff_ft: float = 0
) -> dict:
    """
    Calculate the required speed to clear a gap using projectile motion physics.
    """
    g = 32.174  # ft/s²
    theta = math.radians(ramp_angle_deg)
    x = gap_distance_ft
    y = landing_height_diff_ft
    
    cos_theta = math.cos(theta)
    tan_theta = math.tan(theta)
    
    denominator = 2 * (cos_theta ** 2) * (x * tan_theta - y)
    
    if denominator <= 0:
        denominator = math.sin(2 * theta)
        if denominator <= 0:
            raise ValueError("Invalid angle: cannot compute trajectory")
        v_fps = math.sqrt((x * g) / denominator)
    else:
        v_fps = math.sqrt((g * x * x) / denominator)
    
    v_mph = v_fps * 0.681818
    v_kph = v_fps * 1.09728
    
    flight_time = x / (v_fps * cos_theta) if v_fps * cos_theta > 0 else 0
    
    v_vertical = v_fps * math.sin(theta)
    max_height = (v_vertical ** 2) / (2 * g)
    
    landing_v_fps = math.sqrt(v_fps ** 2 - 2 * g * y) if (v_fps ** 2 - 2 * g * y) > 0 else v_fps
    landing_v_mph = landing_v_fps * 0.681818
    landing_v_kph = landing_v_fps * 1.09728
    
    # Generate trajectory points
    trajectory = generate_trajectory_points(v_fps, theta, gap_distance_ft, landing_height_diff_ft)
    
    return {
        "required_speed_fps": round(v_fps, 2),
        "required_speed_mph": round(v_mph, 2),
        "required_speed_kph": round(v_kph, 2),
        "flight_time_seconds": round(flight_time, 2),
        "max_height_feet": round(max_height, 2),
        "max_height_meters": round(max_height * 0.3048, 2),
        "landing_velocity_mph": round(landing_v_mph, 2),
        "landing_velocity_kph": round(landing_v_kph, 2),
        "trajectory_points": trajectory
    }


def generate_share_code() -> str:
    """Generate a unique 8-character share code."""
    return uuid.uuid4().hex[:8].upper()


# API Routes
@api_router.get("/")
async def root():
    return {"message": "Dirt Bike Jump Calculator API"}


@api_router.post("/calculate-jump", response_model=JumpCalculationResult)
async def calculate_jump(input_data: JumpCalculationInput):
    """Calculate the required speed to clear a gap on a dirt bike."""
    warnings = []
    
    if input_data.ramp_angle <= 0 or input_data.ramp_angle >= 90:
        raise HTTPException(status_code=400, detail="Ramp angle must be between 0 and 90 degrees")
    
    if input_data.gap_distance <= 0:
        raise HTTPException(status_code=400, detail="Gap distance must be positive")
    
    total_weight_lbs = input_data.bike_weight + input_data.rider_weight
    total_weight_kg = total_weight_lbs * 0.453592
    
    if total_weight_lbs > 500:
        warnings.append("Heavy combined weight may affect suspension and landing. Consider adjusting suspension settings.")
    
    gap_distance_ft = input_data.gap_distance
    landing_height_ft = input_data.landing_height or 0
    
    if input_data.unit_system == "metric":
        gap_distance_ft = input_data.gap_distance * 3.28084
        landing_height_ft = (input_data.landing_height or 0) * 3.28084
    
    try:
        result = calculate_jump_speed(
            ramp_angle_deg=input_data.ramp_angle,
            gap_distance_ft=gap_distance_ft,
            landing_height_diff_ft=landing_height_ft
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    safety_factor = 1.15
    safety_speed_mph = round(result["required_speed_mph"] * safety_factor, 2)
    safety_speed_kph = round(result["required_speed_kph"] * safety_factor, 2)
    
    if result["required_speed_mph"] > 60:
        warnings.append("High speed required! This is an advanced jump. Ensure proper safety gear and experience.")
    
    if input_data.ramp_angle > 45:
        warnings.append("Steep ramp angle may cause instability during takeoff.")
    
    if input_data.ramp_angle < 15:
        warnings.append("Low ramp angle requires higher speed and longer landing zone.")
    
    if result["landing_velocity_mph"] > 50:
        warnings.append("High landing velocity. Ensure proper landing ramp and suspension setup.")
    
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
        trajectory_points=result["trajectory_points"],
        warnings=warnings
    )
    
    await db.jump_calculations.insert_one(calculation_result.dict())
    
    return calculation_result


@api_router.post("/save-calculation", response_model=SavedCalculation)
async def save_calculation(request: SaveCalculationRequest):
    """Save a calculation with optional location and sharing."""
    share_code = generate_share_code() if request.share else None
    
    saved_calc = SavedCalculation(
        name=request.name,
        description=request.description,
        calculation=request.calculation,
        location=request.location,
        is_shared=request.share,
        share_code=share_code
    )
    
    await db.saved_calculations.insert_one(saved_calc.dict())
    
    return saved_calc


@api_router.get("/saved-calculations", response_model=List[SavedCalculation])
async def get_saved_calculations(limit: int = 50):
    """Get all saved calculations."""
    calculations = await db.saved_calculations.find().sort("created_at", -1).limit(limit).to_list(limit)
    return [SavedCalculation(**calc) for calc in calculations]


@api_router.get("/saved-calculation/{calculation_id}", response_model=SavedCalculation)
async def get_saved_calculation(calculation_id: str):
    """Get a specific saved calculation by ID."""
    calc = await db.saved_calculations.find_one({"id": calculation_id})
    if not calc:
        raise HTTPException(status_code=404, detail="Calculation not found")
    return SavedCalculation(**calc)


@api_router.delete("/saved-calculation/{calculation_id}")
async def delete_saved_calculation(calculation_id: str):
    """Delete a saved calculation."""
    result = await db.saved_calculations.delete_one({"id": calculation_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Calculation not found")
    return {"message": "Calculation deleted"}


@api_router.post("/share-calculation/{calculation_id}")
async def share_calculation(calculation_id: str):
    """Make a calculation shareable and get share code."""
    calc = await db.saved_calculations.find_one({"id": calculation_id})
    if not calc:
        raise HTTPException(status_code=404, detail="Calculation not found")
    
    if calc.get("share_code"):
        return {"share_code": calc["share_code"], "already_shared": True}
    
    share_code = generate_share_code()
    await db.saved_calculations.update_one(
        {"id": calculation_id},
        {"$set": {"is_shared": True, "share_code": share_code}}
    )
    
    return {"share_code": share_code, "already_shared": False}


@api_router.get("/shared/{share_code}", response_model=SavedCalculation)
async def get_shared_calculation(share_code: str):
    """Get a shared calculation by share code."""
    calc = await db.saved_calculations.find_one({"share_code": share_code.upper(), "is_shared": True})
    if not calc:
        raise HTTPException(status_code=404, detail="Shared calculation not found")
    return SavedCalculation(**calc)


@api_router.get("/map-locations")
async def get_map_locations():
    """Get all calculations with locations for map display."""
    calculations = await db.saved_calculations.find(
        {"location": {"$ne": None}}
    ).to_list(1000)
    
    locations = []
    for calc in calculations:
        if calc.get("location"):
            locations.append({
                "id": calc["id"],
                "name": calc["name"],
                "latitude": calc["location"]["latitude"],
                "longitude": calc["location"]["longitude"],
                "address": calc["location"].get("address"),
                "is_shared": calc.get("is_shared", False),
                "share_code": calc.get("share_code"),
                "required_speed_mph": calc["calculation"]["required_speed_mph"],
                "gap_distance": calc["calculation"]["input_data"]["gap_distance"],
                "ramp_angle": calc["calculation"]["input_data"]["ramp_angle"],
                "created_at": calc["created_at"]
            })
    
    return locations


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
