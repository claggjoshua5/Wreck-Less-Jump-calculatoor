# Changelog

All notable changes to Wreck-Less-Jump-calculatoor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Linting and code quality configuration (ESLint, Prettier, Black, isort, Flake8, mypy)
- Comprehensive testing setup (Jest for frontend, pytest for backend)
- GitHub Actions CI/CD workflows:
  - Frontend lint checking
  - Backend lint checking
  - Frontend test suite (Node 18, 20)
  - Backend test suite (Python 3.9-3.11)
  - PR validation workflow
  - Automated release workflow
- Pre-commit hooks configuration
- Test examples for calculator and API endpoints
- Coverage reporting integration (Codecov)
- Development dependencies documentation
- Google Play Store submission guide in README
- Build configuration for APK generation

### Changed
- Updated README.md with complete setup and Google Play Store deployment instructions
- Improved project documentation structure
- Enhanced CI/CD configuration

### Fixed
- Backend requirements split into production and development dependencies
- Build optimization for cost efficiency

---

## [1.0.0] - 2026-04-05

### Added
- Jump calculation API with physics-based speed requirements
- Trajectory point generation for animation (51 points per jump)
- Trajectory visualization component with SVG rendering
- Real-time animation replay functionality
- Save calculation feature with metadata
- Share calculations with unique codes (8-character)
- Map view showing all saved jump locations
- Location geocoding and address display
- Metric and Imperial unit support
- Safety speed recommendations (+15%)
- Landing velocity calculations
- Warnings system for safety conditions
- Bottom tab navigation (Calculator, Saved, Map)
- Mobile responsive design
- MongoDB database integration
- FastAPI backend with Uvicorn
- Expo Router file-based routing
- React Native UI with Ionicons
- AR mode support (ViroReact)
- Camera and location permissions
- Share sheet integration

### Components

#### Backend (Python/FastAPI)
- `POST /api/calculate-jump` - Calculate required speed with physics
- `POST /api/save-calculation` - Save calculation with metadata
- `GET /api/saved-calculations` - Retrieve all saved calculations
- `POST /api/share-calculation/{id}` - Generate share code
- `GET /api/shared/{code}` - Retrieve shared calculation by code
- `GET /api/map-locations` - Get all locations with calculation data
- `GET /api/health` - Server health check

#### Frontend (React Native/TypeScript)
- **Calculator Screen**
  - Input ramp height, angle, gap distance, weights
  - Unit toggle (Imperial/Metric)
  - Real-time speed calculation
  - Trajectory visualization with animation
  - Safety recommendations
  - Save/Share buttons
  
- **Saved Screen**
  - List all saved calculations
  - View calculation details
  - Share with code
  - Delete calculations
  - Filter/search functionality
  
- **Map Screen**
  - Display saved jump locations
  - Map markers with calculation preview
  - Tap to view full details
  - Location-based sorting

---

## [1.0.0-beta.1] - 2026-04-01

### Added
- Initial beta release with core features
- Jump calculation working
- Basic UI implemented
- API endpoints functional
- Testing framework setup

### Known Issues
- AR mode requires physical device
- Web version shows AR mockup
- MongoDB connection string required

---

## [0.9.0] - 2026-03-15

### Added
- Project initialization
- Expo setup with React Native
- FastAPI backend scaffolding
- Basic component structure

---

## Future Roadmap

### Phase 2 Features (v1.1.0)
- [ ] User authentication and accounts
- [ ] Cloud data sync across devices
- [ ] Offline mode with local caching
- [ ] Video recording and playback
- [ ] Photo gallery for jump locations
- [ ] Bike setup profiles/presets
- [ ] Wind condition input

### Phase 3 Features (v2.0.0)
- [ ] Social sharing to Instagram, TikTok
- [ ] Community jump leaderboards
- [ ] Weather integration (real-time data)
- [ ] Performance analytics dashboard
- [ ] Multi-language support (ES, FR, DE)
- [ ] Accessibility improvements (screen reader, WCAG)
- [ ] Haptic feedback on landing

### Infrastructure (Ongoing)
- [ ] Docker containerization
- [ ] Kubernetes deployment configs
- [ ] Automated deployment pipeline
- [ ] Performance monitoring (Sentry, DataDog)
- [ ] Analytics (Mixpanel, Amplitude)
- [ ] A/B testing framework
- [ ] CDN for static assets

### Testing (Ongoing)
- [ ] Increase coverage to >80%
- [ ] End-to-end testing with Detox
- [ ] Performance benchmarking
- [ ] Load testing for API
- [ ] Security penetration testing

### Platform Expansion
- [ ] iOS App Store submission
- [ ] Desktop app (Electron)
- [ ] Web PWA with offline support
- [ ] VR/VisionOS support

---

## Breaking Changes

### From 0.x to 1.0.0

No breaking changes in initial release.

---

## Migration Guides

None currently.

---

## Deprecated

None currently.

---

## Security Policy

### Reporting Vulnerabilities

If you discover a security vulnerability, please email security@wrecklessjump.com instead of using the issue tracker. Please do not publicly disclose the vulnerability until we have addressed it.

### Security Patches

- Critical fixes: Released immediately
- High priority: Released within 48 hours
- Medium priority: Released in next scheduled release

---

## Contributors

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full list of contributors.

---

## Support & Acknowledgments

### Technologies Used
- Expo - Cross-platform React Native framework
- FastAPI - Modern Python web framework
- MongoDB - Document database
- React Native - Mobile framework
- Pydantic - Data validation

### Inspiration & Resources
- Physics calculations: [Projectile Motion](https://en.wikipedia.org/wiki/Projectile_motion)
- Best practices: [Conventional Commits](https://www.conventionalcommits.org/)
- React patterns: [React Hooks](https://react.dev/reference/react/hooks)

---

## Release Process

### Before Each Release
1. Update version in `package.json` and backend
2. Update `CHANGELOG.md`
3. Run full test suite
4. Run linting checks
5. Update documentation if needed

### Release Steps
1. Create commit: `git commit -m "chore(release): v1.2.3"`
2. Create tag: `git tag v1.2.3`
3. Push: `git push origin main --tags`
4. GitHub Actions automatically creates release

### Deployment Timeline
- Tag push → Automated tests (5 min)
- Tests pass → Build APK (10 min)
- Build complete → Create GitHub Release (2 min)
- Manual: Submit to Google Play Store

---

## Version History Summary

| Version | Date | Type | Key Features |
|---------|------|------|--------------|
| 1.0.0 | 2026-04-05 | Release | Initial stable release |
| 0.9.0 | 2026-03-15 | Beta | Project setup |

---

## How to Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on:
- Setting up development environment
- Code style and standards
- Testing requirements
- Commit message format
- PR process
- Release process

---

## Support

For support, please:
1. Check the [README.md](README.md) for setup help
2. Review [CONTRIBUTING.md](CONTRIBUTING.md) for development questions
3. Open an issue if you find a bug
4. Check existing issues before creating a new one
5. Join discussions for feature requests

---

**Last Updated:** August 21, 2026

**Maintained by:** [Your Name/Team]

**Repository:** https://github.com/claggjoshua5/Wreck-Less-Jump-calculatoor
