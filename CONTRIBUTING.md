# Contributing to Wreck-Less-Jump-calculatoor

Thank you for your interest in contributing! We appreciate all contributions, whether they're bug fixes, new features, documentation improvements, or code quality enhancements.

## Code of Conduct

Please be respectful and professional in all interactions. We're building a welcoming community.

---

## Getting Started

### 1. Fork & Clone
```bash
git clone https://github.com/YOUR_USERNAME/Wreck-Less-Jump-calculatoor.git
cd Wreck-Less-Jump-calculatoor
```

### 2. Set Up Development Environment

**Frontend:**
```bash
cd frontend
npm install
npm run lint:fix
npm run type-check
```

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

### 3. Create a Feature Branch
```bash
git checkout -b feat/your-feature-name
```

---

## Development Guidelines

### Code Style

#### Frontend (TypeScript/React Native)
- **Formatter:** Prettier (auto-formats on save with `.prettierrc`)
- **Linter:** ESLint
- **Type Checking:** TypeScript strict mode

```bash
# Format before committing
npm run lint:fix
npm run format
```

#### Backend (Python)
- **Formatter:** Black (100 char line length)
- **Import Sorter:** isort
- **Linter:** Flake8
- **Type Checker:** mypy

```bash
# Format before committing
black .
isort .
flake8 .
mypy .
```

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting, whitespace)
- `refactor:` - Code refactoring without feature changes
- `test:` - Test additions/updates
- `chore:` - Build, dependencies, tooling
- `ci:` - CI/CD configuration

**Examples:**
```
feat(calculator): add metric unit support
fix(trajectory): prevent negative height values
docs(readme): clarify backend setup steps
chore(deps): upgrade fastapi to v0.111.0
```

### File Naming Conventions

**Frontend:**
- Components: PascalCase (e.g., `CalculatorScreen.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useJumpCalculation.ts`)
- Tests: `*.test.tsx` or `*.spec.tsx`

**Backend:**
- Modules: snake_case (e.g., `jump_calculator.py`)
- Classes: PascalCase (e.g., `JumpCalculationInput`)
- Tests: `test_*.py`

---

## Testing

### Frontend Testing

```bash
cd frontend

# Run all tests
npm test

# Run specific test file
npm test calculator.test.tsx

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

**Guidelines:**
- Test critical user flows and calculations
- Mock external API calls
- Aim for >50% coverage
- Use descriptive test names

**Example Test:**
```typescript
describe('Calculator Screen', () => {
  it('should calculate required speed with valid inputs', () => {
    const inputs = {
      rampHeight: 5,
      rampAngle: 30,
      gapDistance: 50,
      bikeWeight: 220,
      riderWeight: 165,
    };
    
    const result = calculateJumpSpeed(inputs);
    expect(result).toBeGreaterThan(0);
  });
});
```

### Backend Testing

```bash
cd backend

# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Specific test file
pytest tests/test_jump_calculation.py

# Verbose output
pytest -v
```

**Guidelines:**
- Test each API endpoint
- Test edge cases and error conditions
- Mock MongoDB connections
- Aim for >70% coverage

**Example Test:**
```python
def test_calculate_jump_with_valid_input(client, sample_calculation_input):
    response = client.post('/api/calculate-jump', json=sample_calculation_input)
    assert response.status_code == 200
    data = response.json()
    assert data['required_speed_mph'] > 0
    assert len(data['trajectory_points']) > 0
```

---

## Pull Request Process

### 1. Before Creating a PR

**Ensure all tests pass:**
```bash
# Frontend
cd frontend
npm test && npm run lint && npm run type-check

# Backend
cd backend
pytest && black --check . && isort --check . && flake8 . && mypy .
```

**Update documentation:**
- Update README.md if you changed setup/usage
- Add docstrings to new functions/classes
- Update CHANGELOG.md

### 2. Create a PR

**Title Format:** Must match Conventional Commits
- ✅ `feat: add trajectory replay button`
- ✅ `fix: prevent division by zero in speed calculation`
- ❌ `Update code`
- ❌ `WIP: new feature`

**Description Template:**
```markdown
## Description
Brief summary of changes

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Closes #123

## Changes Made
- Specific change 1
- Specific change 2

## Testing Done
- How did you test this?
- Any edge cases covered?

## Checklist
- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No breaking changes (or documented)
```

### 3. CI/CD Checks

All of these must pass before merging:
- ✅ Frontend linting (ESLint, Prettier, TypeScript)
- ✅ Backend linting (Black, isort, Flake8, mypy)
- ✅ Frontend tests (Jest)
- ✅ Backend tests (pytest)
- ✅ PR validation (title format, CHANGELOG)

### 4. Code Review

- At least one code owner must approve
- Address requested changes in new commits
- Rebase on main if needed: `git rebase origin/main`

### 5. Merge

Once approved:
1. Ensure all checks still pass
2. Squash commits if desired: `git rebase -i`
3. Merge to main

---

## Documentation

### Code Comments

```typescript
// Frontend - Good example
interface CalculationResult {
  /** Required speed in MPH to clear the jump */
  required_speed_mph: number;
  /** Trajectory points for SVG animation (x, y, time) */
  trajectory_points: TrajectoryPoint[];
}
```

```python
# Backend - Good example
def calculate_trajectory_points(
    v_fps: float,
    theta_rad: float,
    gap_distance_ft: float,
    landing_height_diff_ft: float = 0
) -> List[TrajectoryPoint]:
    """
    Generate trajectory points for projectile motion animation.
    
    Args:
        v_fps: Initial velocity in feet per second
        theta_rad: Launch angle in radians
        gap_distance_ft: Horizontal gap distance in feet
        landing_height_diff_ft: Vertical height difference (negative if lower)
    
    Returns:
        List of TrajectoryPoint objects with x, y, time coordinates
    
    Raises:
        ValueError: If parameters are invalid (negative distances, etc)
    """
```

### Update CHANGELOG.md

Add your changes under the appropriate section:

```markdown
## [Unreleased]

### Added
- New trajectory replay button
- Support for metric units

### Fixed
- Jump calculation with negative landing heights
- Trajectory point precision on web platform

### Changed
- Improved speed calculation accuracy
- Refactored trajectory visualization component
```

---

## Reporting Issues

### Bug Report

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- Device/Browser: iOS Simulator v15.4
- OS: macOS 12.3
- Version: 1.2.0
```

### Feature Request

```markdown
## Description
What feature would you like?

## Use Case
Why do you need this?

## Proposed Solution
How should it work?

## Alternatives
Any other approaches?
```

---

## Release Process

### Version Numbers

We follow [Semantic Versioning](https://semver.org/):
- `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)
- `MAJOR`: Breaking changes
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes

### Creating a Release

1. **Update version** in package.json and backend (if applicable)
2. **Update CHANGELOG.md** - move Unreleased to version
3. **Commit:** `git commit -m "chore(release): v1.2.3"`
4. **Tag:** `git tag v1.2.3`
5. **Push:** `git push origin main --tags`
6. GitHub Actions will automatically:
   - Run all tests
   - Create GitHub Release
   - (Future: publish to npm/PyPI)

---

## Performance Considerations

### Frontend
- Use `React.memo()` for expensive components
- Lazy load tab content with Expo Router
- Minimize re-renders with proper dependency arrays
- Use FlatList for long lists (not applicable here, but good practice)

### Backend
- Index MongoDB queries (`.location`, `.device_id`)
- Cache calculation results
- Use async/await for I/O operations
- Batch write operations when possible

---

## Security

- Never commit `.env` files or secrets
- Use environment variables for API keys
- Validate all user inputs
- Sanitize data before storing
- Use HTTPS in production
- Keep dependencies updated: `npm audit`, `pip-audit`

---

## Getting Help

- **Questions:** Open a Discussion or Issue
- **Documentation:** Check README.md and inline comments
- **API Reference:** See backend `/docs` endpoint
- **Slack/Chat:** (If available, add contact info)

---

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md
- Release notes
- GitHub contributors page

---

## Thank You! 🙏

Your contributions make this project better. We appreciate your time and effort!

Happy coding! 🚀
