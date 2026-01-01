# Contributing to cc-plugin-eval

Thank you for your interest in contributing! This document provides
guidelines for contributing to this plugin evaluation framework.

## Code of Conduct

This project adheres to our [Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you agree to uphold this code.

## Types of Contributions

| Type                      | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| **Stage Improvements**    | Enhance analysis, generation, execution, or evaluation stages |
| **New Component Support** | Add hooks or MCP server evaluation (Phase 2-3)                |
| **Detection Methods**     | Improve programmatic detection or LLM judgment                |
| **Output Formats**        | Add new report formats (e.g., HTML, Markdown)                 |
| **Bug Fixes**             | Fix issues in parsing, execution, or metrics calculation      |
| **Documentation**         | Improve README, add examples, clarify usage                   |

## Project Structure

```text
src/
├── index.ts              # CLI entry point (dotenv MUST be first import)
├── config/               # Configuration loading with Zod validation
├── stages/
│   ├── 1-analysis/       # Plugin parsing, trigger extraction
│   ├── 2-generation/     # Scenario generation (LLM + deterministic)
│   ├── 3-execution/      # Agent SDK integration, tool capture
│   └── 4-evaluation/     # Programmatic detection, LLM judge, metrics
├── state/                # Resume capability, checkpointing
├── types/                # TypeScript interfaces
└── utils/                # Retry, concurrency, logging utilities

tests/
├── unit/                 # Unit tests mirror src/ structure
└── integration/          # Integration tests for full stages
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- An Anthropic API key

### Installation

```bash
# Clone and install
git clone https://github.com/sjnims/cc-plugin-eval.git
cd cc-plugin-eval
npm install

# Create environment file
echo "ANTHROPIC_API_KEY=sk-ant-your-key" > .env

# Build
npm run build
```

### Running Tests

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

## Code Style

This project uses strict TypeScript with ESLint. Key conventions:

- **Strict TypeScript**: All strict flags enabled, `noUncheckedIndexedAccess`
- **Explicit return types**: Required on all functions
- **Import order**: builtin → external → internal → parent → sibling
- **Type imports**: Always use `import type` for type-only imports
- **Unused parameters**: Prefix with underscore (`_param`)

## Linting

Run all linters before submitting:

```bash
# TypeScript/ESLint (required)
npm run lint
npm run typecheck

# Code formatting
npx prettier --check "src/**/*.ts" "*.json" "*.md"

# Markdown
markdownlint "*.md"

# YAML
uvx yamllint -c .yamllint.yml seed.yaml .yamllint.yml

# GitHub Actions
actionlint .github/workflows/*.yml
```

## Testing Requirements

- **Coverage thresholds**: 78% lines/statements, 75% functions, 65% branches
- Unit tests for all new functionality
- Integration tests for stage-level changes
- Mock external API calls (Anthropic SDK)

```bash
# Run a single test file
npx vitest run tests/unit/stages/1-analysis/skill-analyzer.test.ts

# Run tests matching a pattern
npx vitest run -t "SkillAnalyzer"
```

## Pull Request Process

1. **Fork** and create a feature branch
   - `feat/description` for new features
   - `fix/description` for bug fixes
   - `docs/description` for documentation
   - `refactor/description` for refactoring

2. **Make changes** following the code style above

3. **Ensure quality gates pass**
   - All linters pass (`npm run lint`, `npm run typecheck`)
   - All tests pass (`npm test`)
   - Coverage threshold met (`npm run test:coverage`)

4. **Submit PR** using the provided template
   - Link to related issue if applicable
   - Describe what changed and why
   - Include test plan

5. **Address review feedback**

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add JUnit XML output format
fix: correct token estimation for Claude 3.5 Sonnet
docs: update CLI usage examples
refactor: extract scenario validation to separate module
test: add integration tests for stage 4
chore: update dependencies
```

## Architecture Notes

### Detection Strategy

**Programmatic detection is primary** (100% confidence):

1. PreToolUse hooks capture tool invocations during execution
2. Parse `Skill`, `Task`, `SlashCommand` tool calls from captures
3. LLM judge is secondary, used only for quality assessment

### SDK Integration

Two SDK integration points exist:

| SDK                              | Used In     | Purpose                               |
| -------------------------------- | ----------- | ------------------------------------- |
| `@anthropic-ai/sdk`              | Stages 2, 4 | LLM calls for generation and judgment |
| `@anthropic-ai/claude-agent-sdk` | Stage 3     | Plugin loading and execution          |

### State Management

Pipeline state is saved after each stage to `results/{plugin}/{run-id}/state.json`,
enabling resume on interruption. When modifying stages, ensure state serialization
remains compatible.

## Questions?

Open a [Discussion](https://github.com/sjnims/cc-plugin-eval/discussions)
for questions or ideas before starting significant work.

## Version Release Procedure

This project follows semantic versioning. The version is defined in `package.json` (single source of truth).

### Pre-Release Checklist

Run all validation before starting:

```bash
npm run typecheck
npm run lint
npm test
npm run build

# Additional linters
npx prettier --check "src/**/*.ts" "*.json" "*.md"
markdownlint "*.md"
uvx yamllint -c .yamllint.yml seed.yaml .yamllint.yml
actionlint .github/workflows/*.yml
```

Review commits since last release:

```bash
git log v0.x.x..HEAD --oneline
```

### Determine Version Bump

- **patch** (0.1.x): Bug fixes, dependency updates
- **minor** (0.x.0): New features, backwards-compatible
- **major** (x.0.0): Breaking changes

### Release Steps

#### Step 1: Create Release Branch

```bash
git checkout main
git pull origin main
git checkout -b release/v0.x.x
```

#### Step 2: Update Version

```bash
npm version <major|minor|patch> --no-git-tag-version
```

Verify the change:

```bash
rg '"version"' package.json
```

#### Step 3: Update CHANGELOG.md

1. Move items from `[Unreleased]` to new version section
2. Add release date in format `YYYY-MM-DD`
3. Organize changes into categories: Added, Changed, Deprecated, Removed, Fixed, Security
4. Update comparison links at bottom of file

Example:

```markdown
## [Unreleased]

## [0.2.0] - 2025-01-15

### Added

- New feature description (#PR)

### Fixed

- Bug fix description (#PR)

[Unreleased]: https://github.com/sjnims/cc-plugin-eval/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sjnims/cc-plugin-eval/compare/v0.1.0...v0.2.0
```

#### Step 4: Commit and Create PR

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: prepare release v0.x.x"
git push origin release/v0.x.x

gh pr create --title "chore: prepare release v0.x.x" --body "$(cat <<'EOF'
## Release v0.x.x

### Changes
- [List major changes]

### Checklist
- [ ] Version updated in package.json
- [ ] CHANGELOG.md updated with release notes
- [ ] All CI checks pass
- [ ] Tested locally
EOF
)"
```

#### Step 5: Merge and Tag

After PR approval and merge:

```bash
git checkout main
git pull origin main

gh release create v0.x.x \
  --target main \
  --title "v0.x.x" \
  --notes-file - <<'EOF'
## Summary
[Brief description of release]

## What's Changed
[Paste relevant sections from CHANGELOG.md]

**Full Changelog**: https://github.com/sjnims/cc-plugin-eval/compare/v0.x-1.x...v0.x.x
EOF
```

### Version Verification

After release:

```bash
# Check tag exists
git tag -l | grep v0.x.x

# Check GitHub release
gh release view v0.x.x

# Verify CLI version
npm run build && node dist/index.js --version
```
