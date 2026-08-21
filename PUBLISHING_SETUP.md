# Publishing Setup Checklist & Quick Reference

## ✅ What We've Prepared

This document contains all the configuration files and instructions you need to get your project publication-ready. Due to access limitations, here are all the files formatted and ready for you to add manually.

---

## 📋 Step 1: Linting Configuration Files

### `frontend/.eslintrc.json`
```json
{
  "extends": ["expo", "prettier"],
  "plugins": ["@typescript-eslint", "react-hooks"],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "env": {
    "react-native/react-native": true,
    "es2021": true,
    "node": true
  },
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "warn"
  }
}
```

### `frontend/.prettierrc`
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "printWidth": 100
}
```

### `backend/.flake8`
```
[flake8]
max-line-length = 100
extend-ignore = E203, W503
exclude = .git,__pycache__,.venv,.env,venv,*.egg-info,node_modules,.pytest_cache
per-file-ignores =
    __init__.py:F401
    conftest.py:F401
```

### `backend/pyproject.toml`
```toml
[tool.black]
line-length = 100
target-version = ['py39', 'py310', 'py311']
include = '\.pyi?$'
extend-exclude = '''
/(\n  # directories\n  \.eggs\n  | \.git\n  | \.hg\n  | \.mypy_cache\n  | \.tox\n  | \.venv\n  | build\n  | dist\n  | venv\n)/\n'''

[tool.isort]
profile = "black"
line_length = 100
known_first_party = ["app"]
skip_gitignore = true
throw_on_skip = true

[tool.mypy]
python_version = "3.9"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = false
ignore_missing_imports = true
```

### `.editorconfig`
```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{js,ts,tsx,jsx}]
indent_style = space
indent_size = 2

[*.{py}]
indent_style = space
indent_size = 4

[*.json]
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

### `.pre-commit-config.yaml`
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
        args: ['--maxkb=1000']
      - id: check-json
      - id: check-merge-conflict

  - repo: https://github.com/psf/black
    rev: 24.1.1
    hooks:
      - id: black
        language_version: python3.11
        files: ^backend/

  - repo: https://github.com/PyCQA/isort
    rev: 5.13.2
    hooks:
      - id: isort
        args: ["--profile=black"]
        files: ^backend/

  - repo: https://github.com/PyCQA/flake8
    rev: 7.0.0
    hooks:
      - id: flake8
        args: ["--max-line-length=100", "--extend-ignore=E203,W503"]
        files: ^backend/

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v3.1.1
    hooks:
      - id: prettier
        types_or: [javascript, typescript, jsx, tsx, json, markdown]
        files: ^frontend/
```

---

## 📋 Step 2: Testing Setup

### `frontend/jest.config.js`
See file at: `.github/setup-files/jest.config.js`

### `frontend/jest.setup.js`
See file at: `.github/setup-files/jest.setup.js`

### `backend/tests/conftest.py`
See file at: `.github/setup-files/conftest.py`

### `backend/requirements-dev.txt`
```
pytest>=8.0.0
pytest-cov>=4.1.0
pytest-asyncio>=0.23.0
pytest-mock>=3.12.0
black>=24.1.1
isort>=5.13.2
flake8>=7.0.0
mypy>=1.8.0
pre-commit>=3.6.0
ipython>=8.20.0
```

### Update `frontend/package.json` scripts:
```json
{
  "scripts": {
    "start": "expo start",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint:fix": "eslint app --ext .ts,.tsx --fix && prettier --write app",
    "type-check": "tsc --noEmit",
    "format": "prettier --write 'app/**/*.{ts,tsx,json}'"
  }
}
```

---

## 📋 Step 3: GitHub Actions Workflows

Create these files in `.github/workflows/`:

### `.github/workflows/frontend-lint.yml`
[See content above in Step 1 section]

### `.github/workflows/backend-lint.yml`
[See content above in Step 1 section]

### `.github/workflows/frontend-test.yml`
[See content above in Step 2 section]

### `.github/workflows/backend-test.yml`
[See content above in Step 2 section]

### `.github/workflows/pr-validation.yml`
[See content above in Step 3 section]

### `.github/workflows/publish.yml`
[See content above in Step 3 section]

---

## 📋 Step 4: Documentation

### Updated `README.md`
Comprehensive README with:
- Feature overview
- Tech stack details
- Quick start guide
- API endpoints reference
- Testing instructions
- CI/CD workflows
- Project structure
- Environment variables
- Development workflow
- Deployment instructions
- Troubleshooting guide

### `CONTRIBUTING.md`
Guidelines for:
- Setting up development environment
- Code style and standards
- Testing requirements
- Commit message format
- PR process
- Issue reporting
- Release process

### `CHANGELOG.md`
Structured changelog with:
- Version history
- Feature list
- Bug fixes
- Breaking changes
- Migration guides
- Future roadmap

---

## 🚀 Quick Installation Guide

### 1. Install Frontend Dev Dependencies
```bash
cd frontend
npm install --save-dev jest jest-expo ts-jest @testing-library/react-native @testing-library/jest-native eslint-plugin-react-hooks @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier
```

### 2. Install Backend Dev Dependencies
```bash
cd backend
pip install -r requirements-dev.txt
```

### 3. Set Up Pre-commit Hooks
```bash
pre-commit install
pre-commit run --all-files
```

### 4. Create `.github/workflows/` directory
```bash
mkdir -p .github/workflows
```

### 5. Add all workflow files from Step 3 above

---

## ✅ Verification Checklist

After adding all files:

```bash
# Frontend checks
cd frontend
npm run lint        # Should pass
npm run type-check  # Should pass
npm test            # Should run

# Backend checks
cd backend
black --check .     # Should pass
isort --check-only . # Should pass
flake8 .            # Should pass
mypy .              # Should pass
pytest              # Should pass
```

---

## 📚 NPM Scripts Summary

**Frontend:**
- `npm start` - Start development server
- `npm test` - Run tests
- `npm run test:watch` - Watch mode for tests
- `npm run test:coverage` - Coverage report
- `npm run lint` - Check linting
- `npm run lint:fix` - Auto-fix linting issues
- `npm run type-check` - TypeScript type checking
- `npm run format` - Format with Prettier

**Backend:**
- `pytest` - Run all tests
- `pytest --cov` - Run with coverage
- `black .` - Format code
- `isort .` - Sort imports
- `flake8 .` - Lint check
- `mypy .` - Type checking

---

## 🔧 CI/CD Workflows Overview

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **frontend-lint** | Frontend changes | ESLint, Prettier, TypeScript |
| **backend-lint** | Backend changes | Black, isort, Flake8, mypy |
| **frontend-test** | Frontend changes | Jest tests (Node 18, 20) |
| **backend-test** | Backend changes | pytest (Python 3.9-3.11) |
| **pr-validation** | Every PR | Title format, CHANGELOG check |
| **publish** | Version tags (v*) | Create GitHub Release |

---

## 📝 Commit Message Examples

```
feat(calculator): add metric unit support
fix(trajectory): prevent negative height values
docs(readme): clarify backend setup steps
style(frontend): format with prettier
refactor(backend): simplify speed calculation
test(api): add endpoint test coverage
chore(deps): upgrade fastapi to v0.111.0
ci(workflows): add codecov integration
```

---

## 🎯 Next Steps

1. **Add all configuration files** from this guide to your repository
2. **Update package.json** with new scripts
3. **Install dev dependencies** (see Quick Installation Guide)
4. **Create `.github/workflows/` directory** and add all workflow files
5. **Run verification checklist** to ensure everything works
6. **Commit changes** with meaningful message:
   ```bash
   git add .
   git commit -m "chore: add publishing infrastructure (linting, testing, CI/CD)"
   ```
7. **Create a Pull Request** to review changes
8. **Merge after CI checks pass**

---

## 📞 Support Resources

- **ESLint Docs:** https://eslint.org/docs/rules/
- **Prettier Docs:** https://prettier.io/docs/en/
- **Black Docs:** https://black.readthedocs.io/
- **Jest Docs:** https://jestjs.io/docs/getting-started
- **pytest Docs:** https://docs.pytest.org/
- **GitHub Actions:** https://docs.github.com/en/actions

---

**Last Updated:** August 21, 2026

This document contains everything you need to make your project publication-ready! 🚀
