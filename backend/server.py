from fastapi import FastAPI, APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import hashlib
import hmac
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
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
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: Optional[str] = None


# Payment Models
class CreateCheckoutRequest(BaseModel):
    origin_url: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    device_id: str


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
    device_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    calculation: JumpCalculationResult
    location: Optional[LocationData] = None
    is_shared: bool = False
    share_code: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SaveCalculationRequest(BaseModel):
    device_id: str
    name: str
    description: Optional[str] = None
    calculation: JumpCalculationResult
    location: Optional[LocationData] = None
    share: bool = False


class ShareCalculationRequest(BaseModel):
    calculation_id: str


# Emergency Alert Models
DEFAULT_ALERT_COOLDOWN_MS = 5 * 60 * 1000  # 5 minutes
NEARBY_RIDER_RADIUS_MILES = 5.0


class EmergencySettings(BaseModel):
    # emergency_device_id is a separate, high-entropy identifier generated on-device
    # specifically for the emergency-alert feature. It is never returned by
    # /api/shared/{share_code} or any other endpoint, unlike the general device_id used
    # for saved calculations, so a share-code holder can never learn or claim it.
    emergency_device_id: str
    allow_notifications: bool = True
    location_sharing_enabled: bool = False
    alert_cooldown_ms: int = DEFAULT_ALERT_COOLDOWN_MS
    last_known_location: Optional[LocationData] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class EmergencySettingsPublic(BaseModel):
    allow_notifications: bool
    location_sharing_enabled: bool
    alert_cooldown_ms: int
    has_location: bool


def to_public(settings: EmergencySettings) -> EmergencySettingsPublic:
    return EmergencySettingsPublic(
        allow_notifications=settings.allow_notifications,
        location_sharing_enabled=settings.location_sharing_enabled,
        alert_cooldown_ms=settings.alert_cooldown_ms,
        has_location=settings.last_known_location is not None,
    )


class EmergencySettingsUpdate(BaseModel):
    allow_notifications: Optional[bool] = None
    location_sharing_enabled: Optional[bool] = None
    location: Optional[LocationData] = None


class EmergencyAlert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    emergency_device_id: str
    alert_type: str  # "call_for_help" or "nearby_riders"
    location: Optional[LocationData] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class CallForHelpRequest(BaseModel):
    emergency_device_id: str
    location: Optional[LocationData] = None


class CallForHelpResponse(BaseModel):
    success: bool
    message: str
    alert_id: str


class AlertNearbyRidersRequest(BaseModel):
    emergency_device_id: str
    location: LocationData


class AlertNearbyRidersResponse(BaseModel):
    success: bool
    message: str
    alerted_count: int
    alert_id: str


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


def get_payment_webhook_base_url(http_request: Request) -> str:
    configured_base = os.environ.get("PUBLIC_BACKEND_URL", "").strip().rstrip("/")
    if configured_base:
        return configured_base
    return str(http_request.base_url).rstrip("/")


def require_nonblank_id(value: Optional[str], field_name: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    return normalized


def require_device_id(device_id: Optional[str]) -> str:
    return require_nonblank_id(device_id, "device_id")


def require_emergency_device_id(emergency_device_id: Optional[str]) -> str:
    return require_nonblank_id(emergency_device_id, "emergency_device_id")


def haversine_distance_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in miles."""
    earth_radius_miles = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return 2 * earth_radius_miles * math.asin(min(1, math.sqrt(a)))


def bounding_box(lat: float, lon: float, radius_miles: float):
    """Rough lat/lon bounding box around a point, used as a cheap prefilter query before the
    exact haversine check. Errs on the side of being slightly too generous rather than
    excluding a rider that should match."""
    miles_per_lat_degree = 69.0
    lat_delta = radius_miles / miles_per_lat_degree
    miles_per_lon_degree = max(miles_per_lat_degree * math.cos(math.radians(lat)), 1.0)
    lon_delta = radius_miles / miles_per_lon_degree

    min_lat = max(-90.0, lat - lat_delta)
    max_lat = min(90.0, lat + lat_delta)
    min_lon = max(-180.0, lon - lon_delta)
    max_lon = min(180.0, lon + lon_delta)
    return min_lat, max_lat, min_lon, max_lon


def calculate_safety_margin(total_weight_lbs: float, ramp_height_ft: float, ramp_angle_deg: float) -> float:
    weight_margin = max(0, (total_weight_lbs - 350) / 1500)
    short_ramp_margin = max(0, (4 - ramp_height_ft) * 0.01) if ramp_height_ft > 0 else 0.04
    steep_ramp_margin = min((ramp_angle_deg - 35) / 300, 0.08) if ramp_angle_deg > 35 else 0
    return min(0.35, 0.15 + weight_margin + short_ramp_margin + steep_ramp_margin)


# ==================== PAYMENT ENDPOINTS ====================

@api_router.post("/payments/create-checkout", response_model=CheckoutResponse)
async def create_checkout_session(request: CreateCheckoutRequest, http_request: Request):
    """Create a Stripe checkout session for a 30-day access pass."""
    try:
        if not STRIPE_API_KEY:
            raise HTTPException(status_code=503, detail="Payments are not configured")

        webhook_base_url = get_payment_webhook_base_url(http_request)
        webhook_url = f"{webhook_base_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

        host_url = (request.origin_url or "").rstrip("/")
        success_url = request.success_url or (f"{host_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}" if host_url else None)
        cancel_url = request.cancel_url or (f"{host_url}/payment-cancel" if host_url else None)

        if not success_url or not cancel_url:
            raise HTTPException(status_code=400, detail="Valid payment return URLs are required")
        
        checkout_request = CheckoutSessionRequest(
            amount=SUBSCRIPTION_PRICE,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "device_id": request.device_id,
                "subscription_type": "thirty_day_access",
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
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error creating checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create checkout: {str(e)}")


@api_router.post("/payments/start-trial", response_model=StartTrialResponse)
async def start_free_trial(request: StartTrialRequest):
    """Start a 3-day free trial — no credit card required."""
    try:
        # Check if device already has an active subscription or used a trial
        existing = await db.subscriptions.find_one({"device_id": request.device_id})

        if existing:
            # If already active, don't create a new trial
            expires_at = existing.get("expires_at")
            if expires_at and expires_at > datetime.utcnow():
                return StartTrialResponse(
                    success=True,
                    message="You already have an active subscription or trial.",
                    trial_expires_at=expires_at
                )
            # If they had a trial before that expired, they can't start another
            if existing.get("trial_used", False):
                return StartTrialResponse(
                    success=False,
                    message="Free trial already used. Please subscribe to continue."
                )

        now = datetime.utcnow()
        trial_ends_at = now + timedelta(days=3)

        subscription_data = {
            "device_id": request.device_id,
            "is_active": True,
            "is_trial": True,
            "trial_used": True,
            "expires_at": trial_ends_at,
            "trial_started_at": now,
            "trial_ends_at": trial_ends_at,
            "updated_at": now,
        }

        await db.subscriptions.update_one(
            {"device_id": request.device_id},
            {"$set": subscription_data},
            upsert=True
        )

        return StartTrialResponse(
            success=True,
            message="Your 3-day free trial has started!",
            trial_expires_at=trial_ends_at
        )
    except Exception as e:
        logging.error(f"Error starting free trial: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start trial: {str(e)}")


@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, http_request: Request):
    """Check the status of a payment session."""
    try:
        if not STRIPE_API_KEY:
            raise HTTPException(status_code=503, detail="Payments are not configured")

        webhook_url = f"{get_payment_webhook_base_url(http_request)}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        
        checkout_status = await stripe_checkout.get_checkout_status(session_id)
        
        transaction = await db.payment_transactions.find_one({"session_id": session_id})
        
        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        # Check if this is a trial or regular payment
        is_trial = transaction.get("amount", 0) == 0
        
        if checkout_status.payment_status == "paid" or (is_trial and checkout_status.status == "complete"):
            if transaction.get("status") != "completed":
                # Calculate subscription and trial dates
                now = datetime.utcnow()
                
                if is_trial:
                    # Trial: 3 days free, then monthly
                    trial_ends_at = now + timedelta(days=3)
                    subscription_expires_at = now + timedelta(days=33)  # 3 day trial + 30 day subscription
                else:
                    # Direct purchase: 30 days of access
                    trial_ends_at = None
                    subscription_expires_at = now + timedelta(days=30)
                
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {
                        "$set": {
                            "status": "completed",
                            "payment_status": "paid",
                            "updated_at": now,
                            "subscription_expires_at": subscription_expires_at
                        }
                    }
                )
                
                # Create/update subscription record
                subscription_data = {
                    "is_active": True,
                    "expires_at": subscription_expires_at,
                    "updated_at": now,
                    "last_payment_session": session_id,
                    "is_trial": is_trial,
                }
                
                if is_trial:
                    subscription_data["trial_started_at"] = now
                    subscription_data["trial_ends_at"] = trial_ends_at
                
                await db.subscriptions.update_one(
                    {"device_id": transaction["device_id"]},
                    {"$set": subscription_data},
                    upsert=True
                )
        elif checkout_status.status == "expired":
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {
                    "$set": {
                        "status": "expired",
                        "payment_status": "expired",
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        
        return {
            "status": checkout_status.status,
            "payment_status": checkout_status.payment_status,
            "amount": checkout_status.amount_total / 100 if checkout_status.amount_total else 0,
            "currency": checkout_status.currency,
            "is_trial": is_trial
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error checking payment status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check payment status: {str(e)}")


@api_router.get("/subscription/status/{device_id}", response_model=SubscriptionStatus)
async def get_subscription_status(device_id: str):
    """Check if a device has an active subscription or trial."""
    # Check for paid subscription first
    subscription = await db.subscriptions.find_one({"device_id": device_id})
    
    if subscription:
        expires_at = subscription.get("expires_at")
        is_trial = subscription.get("is_trial", False)
        trial_ends_at = subscription.get("trial_ends_at")
        is_active = expires_at and expires_at > datetime.utcnow() if expires_at else False
        
        if is_active:
            # Check if still in trial period
            if is_trial and trial_ends_at:
                if trial_ends_at > datetime.utcnow():
                    time_remaining = trial_ends_at - datetime.utcnow()
                    days_remaining = time_remaining.total_seconds() / (24 * 60 * 60)
                    return SubscriptionStatus(
                        is_active=True,
                        expires_at=trial_ends_at,
                        device_id=device_id,
                        is_trial=True,
                        trial_info=TrialStatus(
                            is_trial_active=True,
                            trial_started_at=subscription.get("trial_started_at"),
                            trial_expires_at=trial_ends_at,
                            trial_days_remaining=round(days_remaining, 2)
                        ),
                        status_message=f"Trial: {round(days_remaining, 1)} days left"
                    )
                else:
                    # Trial ended, now on paid subscription
                    return SubscriptionStatus(
                        is_active=True,
                        expires_at=expires_at,
                        device_id=device_id,
                        is_trial=False,
                        status_message="30-day access active"
                    )
            
            return SubscriptionStatus(
                is_active=True,
                expires_at=expires_at,
                device_id=device_id,
                is_trial=False,
                status_message="30-day access active"
            )
    
    # No active access
    return SubscriptionStatus(
        is_active=False,
        device_id=device_id,
        is_trial=False,
        trial_info=None,
        status_message="Start your 3-day trial or unlock 30-day access"
    )


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    try:
        if not STRIPE_API_KEY:
            raise HTTPException(status_code=503, detail="Payments are not configured")

        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        # Initialize Stripe
        host_url = get_payment_webhook_base_url(request)
        webhook_url = f"{host_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            # Update transaction
            session_id = webhook_response.session_id
            transaction = await db.payment_transactions.find_one({"session_id": session_id})
            
            if transaction and transaction.get("status") != "completed":
                expires_at = datetime.utcnow() + timedelta(days=30)
                
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {
                        "$set": {
                            "status": "completed",
                            "payment_status": "paid",
                            "updated_at": datetime.utcnow(),
                            "subscription_expires_at": expires_at
                        }
                    }
                )
                
                device_id = webhook_response.metadata.get("device_id")
                if device_id:
                    await db.subscriptions.update_one(
                        {"device_id": device_id},
                        {
                            "$set": {
                                "is_active": True,
                                "expires_at": expires_at,
                                "updated_at": datetime.utcnow(),
                                "last_payment_session": session_id
                            }
                        },
                        upsert=True
                    )
        
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Webhook error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Webhook error: {str(e)}")


# ==================== CALCULATOR ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "Wreck-Less Jump Calculator API"}


@api_router.get("/privacy-policy", response_class=HTMLResponse)
async def privacy_policy():
    """Return the privacy policy page."""
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy - Wreck-Less Jump Calculator</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #121212;
                color: #fff;
                line-height: 1.6;
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
            }
            h1 { color: #FF6B35; margin-bottom: 10px; font-size: 28px; }
            h2 { color: #FF6B35; margin: 30px 0 15px; font-size: 20px; }
            p { margin-bottom: 15px; color: #ccc; }
            ul { margin: 15px 0 15px 20px; color: #ccc; }
            li { margin-bottom: 8px; }
            .logo { text-align: center; margin-bottom: 30px; }
            .logo span { font-size: 24px; font-weight: bold; color: #FF6B35; }
            .date { color: #888; font-size: 14px; margin-bottom: 30px; }
            .contact { background: #1E1E1E; padding: 20px; border-radius: 12px; margin-top: 30px; }
            .contact h3 { color: #FF6B35; margin-bottom: 10px; }
            .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="logo">
            <span>WRECK-LESS JUMP CALCULATOR</span>
        </div>
        
        <h1>Privacy Policy</h1>
        <p class="date">Last Updated: April 2026</p>
        
        <p>Josh & Heather Productions ("we", "our", or "us") operates the Wreck-Less Jump Calculator mobile application (the "App"). This Privacy Policy explains how we collect, use, and protect your information.</p>
        
        <h2>Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <ul>
            <li><strong>Device Information:</strong> A unique device identifier to manage your subscription and saved calculations.</li>
            <li><strong>Location Data:</strong> If you choose to save a calculation with location, we store the GPS coordinates. This is optional and only collected with your permission.</li>
            <li><strong>Emergency Location Data:</strong> If you enable emergency location sharing, we store your last known location and use it only to determine whether other opted-in riders are nearby when you request an alert. You can disable sharing at any time.</li>
            <li><strong>Calculation Data:</strong> Jump calculations you choose to save, including ramp measurements and results.</li>
            <li><strong>Payment Information:</strong> Processed securely through Stripe. We do not store your credit card details.</li>
            <li><strong>Camera Data:</strong> Photos taken for measurement are processed locally on your device and are not uploaded to our servers.</li>
        </ul>
        
        <h2>How We Use Your Information</h2>
        <ul>
            <li>To provide and maintain the App's functionality</li>
            <li>To manage your subscription and free trial</li>
            <li>To save and sync your jump calculations</li>
            <li>To display jump locations on the map (if you choose to share)</li>
            <li>To improve our services</li>
        </ul>
        
        <h2>Data Sharing</h2>
        <p>We do not sell your personal information. We may share data with:</p>
        <ul>
            <li><strong>Stripe:</strong> For payment processing</li>
            <li><strong>Other Users:</strong> Only if you choose to share a calculation using a share code</li>
        </ul>
        
        <h2>Data Security</h2>
        <p>We implement appropriate security measures to protect your information. Payment data is encrypted and processed by Stripe, a PCI-compliant payment processor.</p>
        
        <h2>Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
            <li>Access your saved calculations</li>
            <li>Delete your saved calculations</li>
            <li>Disable location sharing at any time</li>
            <li>Cancel your subscription</li>
        </ul>
        
        <h2>Children's Privacy</h2>
        <p>The App is not intended for children under 13. We do not knowingly collect information from children under 13.</p>
        
        <h2>Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page.</p>
        
        <div class="contact">
            <h3>Contact Us</h3>
            <p>If you have questions about this Privacy Policy, please contact us at:</p>
            <p><strong>Josh & Heather Productions</strong></p>
        </div>
        
        <p class="footer">&copy; 2026 Josh & Heather Productions. All rights reserved.</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


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
    ramp_height_ft = input_data.ramp_height or 0
    
    if input_data.unit_system == "metric":
        gap_distance_ft = input_data.gap_distance * 3.28084
        landing_height_ft = (input_data.landing_height or 0) * 3.28084
        ramp_height_ft = (input_data.ramp_height or 0) * 3.28084
    
    try:
        result = calculate_jump_speed(
            ramp_angle_deg=input_data.ramp_angle,
            gap_distance_ft=gap_distance_ft,
            landing_height_diff_ft=landing_height_ft
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    safety_margin = calculate_safety_margin(total_weight_lbs, ramp_height_ft, input_data.ramp_angle)
    safety_speed_mph = round(result["required_speed_mph"] * (1 + safety_margin), 2)
    safety_speed_kph = round(result["required_speed_kph"] * (1 + safety_margin), 2)
    
    if result["required_speed_mph"] > 60:
        warnings.append("High speed required! This is an advanced jump. Ensure proper safety gear and experience.")
    
    if input_data.ramp_angle > 45:
        warnings.append("Steep ramp angle may cause instability during takeoff.")
    
    if input_data.ramp_angle < 15:
        warnings.append("Low ramp angle requires higher speed and longer landing zone.")
    
    if result["landing_velocity_mph"] > 50:
        warnings.append("High landing velocity. Ensure proper landing ramp and suspension setup.")

    if ramp_height_ft > 0 and ramp_height_ft < 3:
        warnings.append("Short takeoff ramp height reduces margin for body position and throttle correction.")
    
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
    device_id = require_device_id(request.device_id)
    share_code = generate_share_code() if request.share else None
    
    saved_calc = SavedCalculation(
        device_id=device_id,
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
async def get_saved_calculations(device_id: str, limit: int = 50):
    """Get all saved calculations."""
    normalized_device_id = require_device_id(device_id)
    calculations = await db.saved_calculations.find(
        {"device_id": normalized_device_id}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return [SavedCalculation(**calc) for calc in calculations]


@api_router.get("/saved-calculation/{calculation_id}", response_model=SavedCalculation)
async def get_saved_calculation(calculation_id: str, device_id: str):
    """Get a specific saved calculation by ID."""
    normalized_device_id = require_device_id(device_id)
    calc = await db.saved_calculations.find_one({"id": calculation_id, "device_id": normalized_device_id})
    if not calc:
        raise HTTPException(status_code=404, detail="Calculation not found")
    return SavedCalculation(**calc)


@api_router.delete("/saved-calculation/{calculation_id}")
async def delete_saved_calculation(calculation_id: str, device_id: str):
    """Delete a saved calculation."""
    normalized_device_id = require_device_id(device_id)
    result = await db.saved_calculations.delete_one({"id": calculation_id, "device_id": normalized_device_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Calculation not found")
    return {"message": "Calculation deleted"}


@api_router.post("/share-calculation/{calculation_id}")
async def share_calculation(calculation_id: str, device_id: str):
    """Make a calculation shareable and get share code."""
    normalized_device_id = require_device_id(device_id)
    calc = await db.saved_calculations.find_one({"id": calculation_id, "device_id": normalized_device_id})
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
async def get_map_locations(device_id: str):
    """Get all calculations with locations for map display."""
    normalized_device_id = require_device_id(device_id)
    calculations = await db.saved_calculations.find(
        {"device_id": normalized_device_id, "location": {"$ne": None}}
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


# ==================== EMERGENCY ALERT ENDPOINTS ====================
# NOTE: These endpoints never auto-dial or auto-broadcast on their own.
# The frontend always requires an explicit, confirmed user action first.
#
# All auth here keys on emergency_device_id, a separate high-entropy identifier that is
# never exposed by any endpoint (unlike the general device_id used for saved calculations,
# which /api/shared/{share_code} does return). This prevents anyone who learns a rider's
# general device_id from taking over that rider's emergency settings/token.


async def verify_device(emergency_device_id: str, token: Optional[str]) -> Dict:
    """Verify (but never create) an emergency device's credentials.

    Only matches documents that already have both emergency_device_id and token_hash, so
    legacy emergency_settings rows created before this identifier existed can never be
    used for authentication, even if they happen to share a value with device_id.
    """
    settings = await db.emergency_settings.find_one(
        {"emergency_device_id": emergency_device_id, "token_hash": {"$ne": None}}
    )
    token_hash = settings.get("token_hash") if settings else None
    if not token_hash or not token or not hmac.compare_digest(token_hash, hashlib.sha256(token.encode()).hexdigest()):
        raise HTTPException(status_code=401, detail="Invalid or missing device token.")
    return settings


async def enroll_or_verify(emergency_device_id: str, token: Optional[str]) -> Dict:
    """Atomically enroll a brand-new emergency_device_id, or verify an existing one.

    The client generates a high-entropy secret and persists it locally *before* sending
    this request, so this is safe to retry: resending the same secret after a lost
    response, timeout, or app restart always recovers the same claim. Enrollment is a
    single upsert using $setOnInsert against the unique-indexed emergency_device_id field,
    so concurrent first requests with the same secret all converge on one document, and
    concurrent first requests with different secrets have exactly one winner.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or missing device token.")

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.utcnow()
    try:
        settings = await db.emergency_settings.find_one_and_update(
            {"emergency_device_id": emergency_device_id},
            {
                "$setOnInsert": {
                    "emergency_device_id": emergency_device_id,
                    "token_hash": token_hash,
                    "allow_notifications": True,
                    "location_sharing_enabled": False,
                    "alert_cooldown_ms": DEFAULT_ALERT_COOLDOWN_MS,
                    "last_known_location": None,
                    "updated_at": now,
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        # Lost the race to another concurrent first-enrollment request (real MongoDB can
        # surface this from a racing upsert on a unique-indexed field); re-read whichever
        # document won and verify against it below.
        settings = await db.emergency_settings.find_one({"emergency_device_id": emergency_device_id})

    if not settings or not hmac.compare_digest(settings.get("token_hash", ""), token_hash):
        raise HTTPException(status_code=401, detail="Invalid or missing device token.")
    return settings


@api_router.get(
    "/emergency/settings/{emergency_device_id}",
    response_model=EmergencySettingsPublic,
)
async def get_emergency_settings(
    emergency_device_id: str,
    device_token: Optional[str] = Header(None, alias="X-Device-Token"),
):
    """Get a device's emergency alert preferences (location sharing, notifications, cooldown)."""
    normalized_id = require_emergency_device_id(emergency_device_id)
    settings = await verify_device(normalized_id, device_token)
    return to_public(EmergencySettings(**settings))


@api_router.post(
    "/emergency/settings/{emergency_device_id}",
    response_model=EmergencySettingsPublic,
)
async def update_emergency_settings(
    emergency_device_id: str,
    update: EmergencySettingsUpdate,
    device_token: Optional[str] = Header(None, alias="X-Device-Token"),
):
    """Enroll (idempotently) or update a device's emergency alert preferences.

    The server never returns the raw device token; the client generated and persisted it
    before making this request, so it already has it.
    """
    normalized_id = require_emergency_device_id(emergency_device_id)
    existing = await enroll_or_verify(normalized_id, device_token)

    settings = EmergencySettings(**existing)

    if update.allow_notifications is not None:
        settings.allow_notifications = update.allow_notifications

    if update.location_sharing_enabled is not None:
        settings.location_sharing_enabled = update.location_sharing_enabled
        if not update.location_sharing_enabled:
            settings.last_known_location = None

    if update.location is not None and settings.location_sharing_enabled:
        settings.last_known_location = update.location

    settings.updated_at = datetime.utcnow()

    settings_data = settings.dict()
    settings_data["token_hash"] = existing["token_hash"]
    await db.emergency_settings.update_one(
        {"emergency_device_id": normalized_id},
        {"$set": settings_data},
        upsert=True,
    )
    return to_public(settings)


@api_router.post("/emergency/call-for-help", response_model=CallForHelpResponse)
async def call_for_help(
    request: CallForHelpRequest,
    device_token: Optional[str] = Header(None, alias="X-Device-Token"),
):
    """Log an emergency call attempt. The app never auto-dials; this only records that
    the user confirmed the action and was routed to their phone's dialer with 911 pre-filled.
    Location is only stored if the device has opted into location sharing."""
    normalized_id = require_emergency_device_id(request.emergency_device_id)
    settings_doc = await verify_device(normalized_id, device_token)
    sharing_enabled = bool(settings_doc and settings_doc.get("location_sharing_enabled"))
    stored_location = request.location if sharing_enabled else None
    alert = EmergencyAlert(emergency_device_id=normalized_id, alert_type="call_for_help", location=stored_location)
    await db.emergency_alerts.insert_one(alert.dict())
    return CallForHelpResponse(
        success=True,
        message="Emergency call attempt logged. Always confirm the call in your phone's dialer.",
        alert_id=alert.id,
    )


@api_router.post("/emergency/alert-nearby-riders", response_model=AlertNearbyRidersResponse)
async def alert_nearby_riders(
    request: AlertNearbyRidersRequest,
    device_token: Optional[str] = Header(None, alias="X-Device-Token"),
):
    """Log that a rider requested nearby help. Never broadcasts exact location publicly;
    only used server-side to count opted-in devices that are nearby. Enforces a minimum
    cooldown between alerts from the same device to prevent spam.

    NOTE: this only counts nearby devices and logs an alert — there is no push notification
    or other delivery mechanism, so the response message must not claim riders were notified.
    """
    normalized_id = require_emergency_device_id(request.emergency_device_id)
    settings_doc = await verify_device(normalized_id, device_token)

    if not settings_doc or not settings_doc.get("location_sharing_enabled"):
        raise HTTPException(
            status_code=400,
            detail="Enable location sharing in emergency settings before alerting nearby riders.",
        )

    cooldown_ms = settings_doc.get("alert_cooldown_ms", DEFAULT_ALERT_COOLDOWN_MS)

    # Atomic upsert on a per-device cooldown record instead of check-then-insert, to avoid a
    # race where two concurrent requests both read "no recent alert" and both proceed.
    now = datetime.utcnow()
    cutoff = now - timedelta(milliseconds=cooldown_ms)
    try:
        await db.emergency_alert_cooldowns.find_one_and_update(
            {
                "emergency_device_id": normalized_id,
                "$or": [
                    {"last_alert_at": {"$exists": False}},
                    {"last_alert_at": {"$lte": cutoff}},
                ],
            },
            {"$set": {"emergency_device_id": normalized_id, "last_alert_at": now}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        existing = await db.emergency_alert_cooldowns.find_one({"emergency_device_id": normalized_id})
        last_alert_at = existing["last_alert_at"] if existing else now
        if isinstance(last_alert_at, str):
            last_alert_at = datetime.fromisoformat(last_alert_at)
        elapsed_ms = (now - last_alert_at).total_seconds() * 1000
        remaining_seconds = max(1, int((cooldown_ms - elapsed_ms) / 1000))
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {remaining_seconds} more second(s) before sending another alert.",
        )

    alert = EmergencyAlert(emergency_device_id=normalized_id, alert_type="nearby_riders", location=request.location)
    await db.emergency_alerts.insert_one(alert.dict())

    min_lat, max_lat, min_lon, max_lon = bounding_box(
        request.location.latitude, request.location.longitude, NEARBY_RIDER_RADIUS_MILES
    )

    # Only rows with both emergency_device_id and token_hash are enrolled/claimable; this
    # also excludes legacy rows (see startup cleanup) whose stored location may be stale.
    nearby_settings = await db.emergency_settings.find(
        {
            "emergency_device_id": {"$exists": True, "$ne": normalized_id},
            "token_hash": {"$exists": True, "$ne": None},
            "location_sharing_enabled": True,
            "allow_notifications": True,
            "last_known_location": {"$ne": None},
            "last_known_location.latitude": {"$gte": min_lat, "$lte": max_lat},
            "last_known_location.longitude": {"$gte": min_lon, "$lte": max_lon},
        }
    ).to_list(1000)

    alerted_count = 0
    for other in nearby_settings:
        location = other.get("last_known_location")
        if not location:
            continue
        distance_miles = haversine_distance_miles(
            request.location.latitude,
            request.location.longitude,
            location["latitude"],
            location["longitude"],
        )
        if distance_miles <= NEARBY_RIDER_RADIUS_MILES:
            alerted_count += 1

    return AlertNearbyRidersResponse(
        success=True,
        message=(
            f"{alerted_count} nearby rider(s) in range. "
            "This is an unverified report — always call 911 for emergencies."
        ),
        alerted_count=alerted_count,
        alert_id=alert.id,
    )


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

@app.on_event("startup")
async def create_indexes():
    # Unique index backing the atomic upsert used to guard the nearby-riders alert cooldown.
    await db.emergency_alert_cooldowns.create_index("emergency_device_id", unique=True)
    # Unique (sparse) index backing the atomic $setOnInsert upsert used for emergency
    # device enrollment. Sparse so legacy rows that predate emergency_device_id (see the
    # purge below) — which all lack the field — never collide under the uniqueness
    # constraint.
    await db.emergency_settings.create_index("emergency_device_id", unique=True, sparse=True)
    # Legacy emergency_settings rows created before per-device auth have no
    # emergency_device_id/token_hash and can never be claimed or authenticated against by
    # the endpoints above (see verify_device/enroll_or_verify). Their last_known_location
    # is therefore unreachable by its original owner and must not be used for nearby-rider
    # matching, so purge it here. Idempotent and safe to run on every startup.
    await db.emergency_settings.update_many(
        {"emergency_device_id": {"$exists": False}},
        {"$unset": {"last_known_location": ""}},
    )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
