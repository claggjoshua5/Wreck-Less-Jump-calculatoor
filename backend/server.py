from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
import math

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import Stripe integration
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Stripe configuration
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')
SUBSCRIPTION_PRICE = 2.99  # $2.99 monthly subscription

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


# Payment Models
class CreateCheckoutRequest(BaseModel):
    origin_url: Optional[str] = None
    device_id: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class StartTrialRequest(BaseModel):
    device_id: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class StartTrialResponse(BaseModel):
    success: bool
    message: str
    trial_expires_at: Optional[datetime] = None


class TrialStatus(BaseModel):
    is_trial_active: bool
    trial_started_at: Optional[datetime] = None
    trial_expires_at: Optional[datetime] = None
    trial_days_remaining: Optional[float] = None


class SubscriptionStatus(BaseModel):
    is_active: bool
    expires_at: Optional[datetime] = None
    device_id: str
    # Trial info
    is_trial: bool = False
    trial_info: Optional[TrialStatus] = None
    # Status message for UI
    status_message: str = ""


class PaymentTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    device_id: str
    amount: float
    currency: str
    status: str  # 'pending', 'completed', 'failed', 'expired'
    payment_status: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    subscription_expires_at: Optional[datetime] = None


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
    
    vx = v_fps * cos_theta
    vy = v_fps * sin_theta
    
    if vx <= 0:
        return points
    
    total_time = gap_distance_ft / vx
    
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
    """Calculate the required speed to clear a gap using projectile motion physics."""
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


# ==================== PAYMENT ENDPOINTS ====================

@api_router.post("/payments/create-checkout", response_model=CheckoutResponse)
async def create_checkout_session(request: CreateCheckoutRequest, http_request: Request):
    """Create a Stripe checkout session for monthly subscription (no trial)."""
    try:
        # Prefer explicit URLs from client; fall back to origin_url or computed host.
        if request.success_url and request.cancel_url:
            success_url = request.success_url
            cancel_url = request.cancel_url
        else:
            # If origin_url was provided, use it; otherwise derive from http_request
            host_url = (request.origin_url or str(http_request.base_url).rstrip('/')).rstrip('/')
            success_url = f"{host_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
            cancel_url = f"{host_url}/payment-cancel"

        webhook_url = f"{(request.origin_url or str(http_request.base_url).rstrip('/')).rstrip('/')}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

        checkout_request = CheckoutSessionRequest(
            amount=SUBSCRIPTION_PRICE,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "device_id": request.device_id,
                "subscription_type": "monthly",
                "product": "dirt_bike_jump_calculator",
                "has_trial": "false"
            }
        )

        session = await stripe_checkout.create_checkout_session(checkout_request)

        transaction = PaymentTransaction(
            session_id=session.session_id,
            device_id=request.device_id,
            amount=SUBSCRIPTION_PRICE,
            currency="usd",
            status="pending",
            payment_status="pending"
        )
        await db.payment_transactions.insert_one(transaction.dict())

        return CheckoutResponse(
            checkout_url=session.url,
            session_id=session.session_id
        )
    except Exception as e:
        logging.error(f"Error creating checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create checkout: {str(e)}")

# (rest of file unchanged)
