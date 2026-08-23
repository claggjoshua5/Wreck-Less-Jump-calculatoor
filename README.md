# Wreck-Less-Jump-calculatoor 🏍️

A dirt bike jump calculator app with trajectory visualization, save/share functionality, and map integration. Calculate the exact speed needed to clear gaps safely.

## Features

✨ **Core Calculation**
- Calculate required speed for jumps based on ramp height, angle, and gap distance
- Includes bike and rider weight in physics calculations
- Switch between Imperial and Metric units

🎨 **Visualization**
- Real-time SVG trajectory animation showing bike flight path
- Max height and landing speed indicators
- Replay animation button

💾 **Save & Share**
- Save calculations with custom names and descriptions
- Generate shareable codes for calculations
- Track location data for each jump
- Share results via device share sheet

📍 **Location Features**
- Map view of all saved jump locations
- Location-based calculation tracking
- Address geocoding for saved jumps

📱 **Platform Support**
- iOS, Android, and Web (via Expo)
- AR mode for trajectory visualization on physical devices

---

## Tech Stack

### Frontend
- **Framework:** Expo 54 with React Native
- **Language:** TypeScript
- **State Management:** React Hooks
- **Navigation:** Expo Router
- **UI:** React Native components + SVG animations
- **Testing:** Jest + React Native Testing Library

### Backend
- **Framework:** FastAPI + Uvicorn
- **Language:** Python 3.9+
- **Database:** MongoDB
- **API:** RESTful with Pydantic validation
- **Testing:** pytest

---

## Quick Start

### Prerequisites
- Node.js 18+ (frontend)
- Python 3.9+ (backend)
- MongoDB (local or cloud)
- npm or yarn
- EAS CLI (for Expo builds): `npm install -g eas-cli`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npx expo start

# Run tests
npm test

# Run linting
npm run lint
npm run type-check
```

**Development Options:**
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for web
- Press `j` for Expo Go (camera scan QR code)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Set environment variables
cp .env.example .env  # Edit with your MongoDB URL

# Start server
uvicorn server:app --reload

# Run tests
pytest

# Run linting
black . && isort . && flake8 . && mypy .
```

**Backend runs on:** `http://localhost:8000`
**API Docs:** `http://localhost:8000/docs` (Swagger UI)

---

## Building & Submitting to Google Play Store

### Prerequisites
- EAS CLI installed: `npm install -g eas-cli`
- Expo account (free at https://expo.dev)
- Google Play Console account (one-time $25 fee)
- Java Development Kit (JDK) for signing
- Android Studio (optional but recommended)

### Step 1: Configure Your App

Update `frontend/app.json`:

```json
{
  "expo": {
    "name": "Wreck-Less Jump Calculator",
    "slug": "wreck-less-jump-calculator",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#121212"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTabletMode": true,
      "bundleIdentifier": "com.yourname.wrecklessjump"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#121212"
      },
      "package": "com.yourname.wrecklessjump",
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA"
      ],
      "versionCode": 1
    },
    "web": {
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermissions": "Allow Wreck-Less to access your location for saving jump locations."
        }
      ]
    ]
  }
}
```

### Step 2: Set Up EAS Project

```bash
cd frontend

# Login to Expo
eas login

# Initialize EAS
eas build:configure

# Select Android for platform
```

### Step 3: Generate Signing Key (One-time)

```bash
# Generate and store securely
eas credentials
```

Follow prompts to:
- Create a new Android keystore
- Save credentials (EAS will store them)

### Step 4: Build APK Locally (Cost-efficient Option)

**Option A: Free Local Build with `expo-dev-client`**

```bash
cd frontend

# Install development client
npm install expo-dev-client

# Build APK locally
eas build --platform android --local

# Outputs APK to: ./dist/
```

**Option B: Use EAS Cloud (Small Credit Cost)**

```bash
# Build on EAS servers ($0.50-$1 per build typically)
eas build --platform android --profile production
```

### Step 5: Submit to Google Play Store

#### Create Your App on Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Create new app
3. Fill in app details:
   - App name: "Wreck-Less Jump Calculator"
   - Category: Sports
   - Content rating: Suitable for all ages
4. Upload app icon (512x512 PNG)
5. Add screenshots (minimum 2)
6. Write description, privacy policy, etc.

#### Upload APK

1. Navigate to **Release > Production**
2. Click **Create new release**
3. Upload your APK file
4. Add release notes
5. Review and submit for review

### Step 6: Optimize for Cost Efficiency

**Reduce Build Costs:**

```bash
# Use development profile (smaller build, free locally)
eas build --platform android --profile development --local

# Or use internal testing track (faster review)
eas build --platform android --profile preview

# Cache builds to avoid rebuilds
eas build:cache --list
```

**Backend Optimization:**

Use free MongoDB tier:
- MongoDB Atlas free tier: up to 512MB
- AWS Lambda free tier: 1M requests/month
- Heroku free tier alternative: Railway, Render, Fly.io

---

## Alternative: Faster, Cheaper Development Build

If you want to quickly test on real devices without production builds:

```bash
# Install development client
npm install expo-dev-client

# Build development APK (takes ~5 min locally)
eas build --platform android --profile development --local

# Result: Can update via Expo over-the-air (OTA)
# No need to rebuild APK for code changes
```

This approach:
- ✅ Builds locally (free)
- ✅ Fast iteration (OTA updates)
- ✅ Perfect for testing on devices
- ✅ Can later build production APK when ready

---

## Useful Commands

### Expo Commands

```bash
# Preview app on device without building
npx expo start --dev-client

# List available profiles
eas build --list-profiles

# Monitor build progress
eas build:list

# Cache management
eas build:cache --list
eas build:cache --delete --all
```

### Testing on Device

```bash
# Install Expo Go app on your device
# Scan QR code from: npx expo start

# Or use development client for more features
eas build --platform android --profile development --local
```

---

## API Endpoints

### Jump Calculations
- `POST /api/calculate-jump` - Calculate required speed and trajectory
- `GET /api/calculation-history` - Get all calculations

### Save & Share
- `POST /api/save-calculation` - Save a calculation
- `GET /api/saved-calculations` - List all saved calculations
- `POST /api/share-calculation/{id}` - Generate share code
- `GET /api/shared/{code}` - Retrieve shared calculation

### Locations
- `GET /api/map-locations` - Get all saved locations with calculation data

### Health
- `GET /api/health` - Server status check

---

## Testing

### Frontend Tests
```bash
cd frontend
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Backend Tests
```bash
cd backend
pytest                   # Run all tests
pytest --cov           # With coverage
pytest -v              # Verbose output
```

---

## Code Quality

### Linting & Formatting

**Frontend:**
```bash
cd frontend
npm run lint            # Check for linting errors
npm run lint:fix        # Auto-fix linting errors
npm run format          # Format with Prettier
```

**Backend:**
```bash
cd backend
black . && isort .      # Format code
flake8 .                # Check style
mypy .                  # Type checking
```

---

## CI/CD Workflows

GitHub Actions automatically:
- Run linting checks on PR
- Run tests before merge
- Build and publish releases on version tags

---

## Project Structure

```
Wreck-Less-Jump-calculatoor/
├── frontend/                    # React Native/Expo app
│   ├── app/                     # Expo Router app structure
│   │   ├── (tabs)/              # Tab navigation screens
│   │   │   ├── index.tsx        # Calculator screen
│   │   │   ├── saved.tsx        # Saved calculations
│   │   │   └── map.tsx          # Map view
│   │   ├── _layout.tsx          # Root layout
│   │   └── __tests__/           # Component tests
│   ├── assets/                  # Images, fonts, icons
│   ├── app.json                 # Expo configuration
│   ├── eas.json                 # EAS build configuration
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                     # FastAPI server
│   ├── server.py                # Main application
│   ├── requirements.txt         # Production dependencies
│   ├── requirements-dev.txt     # Development dependencies
│   ├── tests/                   # Test suite
│   │   ├── conftest.py
│   │   ├── test_jump_calculation.py
│   │   └── test_save_calculation.py
│   └── .env                     # Environment variables
│
├── .github/
│   └── workflows/               # GitHub Actions
│
├── .editorconfig
├── README.md                    # This file
├── CONTRIBUTING.md
├── CHANGELOG.md
└── .gitignore
```

---

## Environment Variables

### Backend (.env)
```env
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/wreck-less-jump
ENVIRONMENT=production
DEBUG=False
```

### Frontend (.env in frontend/)
```env
EXPO_PUBLIC_BACKEND_URL=https://your-api-url.com
```

---

## Troubleshooting

### Build Issues

**"EAS CLI not found"**
```bash
npm install -g eas-cli
```

**"Keystore not found"**
```bash
# Regenerate credentials
eas credentials
```

**"Build taking too long"**
- Use local builds: `eas build --platform android --local`
- Clear cache: `eas build:cache --delete --all`

### App Issues

**Location permissions not working**
- Check `app.json` location plugin configuration
- Ensure permissions are requested at runtime

**Backend connection errors**
- Verify `EXPO_PUBLIC_BACKEND_URL` in frontend `.env`
- Check backend is running and accessible

---

## Performance Tips

- Profile app: `npx expo-dev-client --profile`
- Use React DevTools: `npx react-devtools`
- Monitor network: Check DevTools Network tab
- Optimize bundle: `npx expo export`

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Code style
- Testing requirements
- PR process
- Release process

---

## License

[Add your license]

---

## Support

For issues or questions:
- Open a GitHub Issue
- Check API docs at backend `/docs`
- Review CONTRIBUTING.md

---

**Happy Jumping! 🏍️✨**
