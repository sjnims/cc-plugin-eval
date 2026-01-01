## Description

<!-- Provide a clear and concise description of your changes -->

## Type of Change

<!-- Mark the relevant option with an "x" -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Performance optimization (improves efficiency without changing behavior)
- [ ] Refactoring (code change that neither fixes a bug nor adds a feature)
- [ ] Test (adding or updating tests)
- [ ] Documentation update (improvements to README, CLAUDE.md, or inline docs)
- [ ] Configuration change (changes to seed.yaml, eslint, tsconfig, etc.)

## Component(s) Affected

<!-- Mark all that apply -->

### Pipeline Stages

- [ ] Stage 1: Analysis (`src/stages/1-analysis/`)
- [ ] Stage 2: Generation (`src/stages/2-generation/`)
- [ ] Stage 3: Execution (`src/stages/3-execution/`)
- [ ] Stage 4: Evaluation (`src/stages/4-evaluation/`)

### Core Infrastructure

- [ ] CLI & Pipeline Orchestration (`src/index.ts`)
- [ ] Configuration (`src/config/`)
- [ ] State Management (`src/state/`)
- [ ] Types (`src/types/`)
- [ ] Utilities (`src/utils/`)

### Other

- [ ] Tests (`tests/`)
- [ ] Documentation (`CLAUDE.md`, `README.md`)
- [ ] Configuration files (`seed.yaml`, `eslint.config.js`, `tsconfig.json`, etc.)
- [ ] GitHub templates/workflows (`.github/`)
- [ ] Other (please specify):

## Motivation and Context

<!-- Why is this change required? What problem does it solve? -->
<!-- If it fixes an open issue, please link to the issue here using one of these formats: -->
<!-- Fixes #123 - closes issue when PR merges -->
<!-- Closes #123 - same as Fixes -->
<!-- Resolves #123 - same as Fixes -->
<!-- Related to #123 - links without closing -->

Fixes # (issue)

## How Has This Been Tested?

<!-- Describe the tests you ran to verify your changes -->

**Test Configuration**:

- Node.js version:
- OS:

**Test Steps**:

1. <!-- e.g., Run `npm test` to execute unit tests -->
2. <!-- e.g., Run `npm run typecheck` to verify types -->
3. <!-- e.g., Run `cc-plugin-eval analyze -p ./sample-plugin` to test Stage 1 -->
4. <!-- etc. -->

## Checklist

### General

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings or errors

### TypeScript / Code Quality

- [ ] All functions have explicit return types
- [ ] Strict TypeScript checks pass (`npm run typecheck`)
- [ ] ESM import/export patterns used correctly
- [ ] Unused parameters prefixed with `_`
- [ ] No `any` types without justification

### Documentation

- [ ] I have updated CLAUDE.md if behavior or commands changed
- [ ] I have updated inline JSDoc comments where applicable
- [ ] I have verified all links work correctly

### Linting

- [ ] I have run `npm run lint` and fixed all issues
- [ ] I have run `npx prettier --check "src/**/*.ts" "*.json" "*.md"`
- [ ] I have run `markdownlint "*.md"` on Markdown files
- [ ] I have run `uvx yamllint -c .yamllint.yml` on YAML files (if modified)
- [ ] I have run `actionlint` on workflow files (if modified)

### Testing

- [ ] I have run `npm test` and all tests pass
- [ ] I have added tests for new functionality
- [ ] Test coverage meets thresholds (78% lines, 75% functions, 65% branches)
- [ ] I have tested with a sample plugin (if applicable)

## Stage-Specific Checks

<!-- Only relevant if you modified pipeline stages -->

<details>
<summary><strong>Stage 1: Analysis</strong> (click to expand)</summary>

- [ ] Plugin parsing handles edge cases (missing fields, malformed YAML)
- [ ] Trigger extraction works for all component types (skills, agents, commands)
- [ ] Zod validation schemas are correct and complete
- [ ] Error messages are clear and actionable

</details>

<details>
<summary><strong>Stage 2: Generation</strong> (click to expand)</summary>

- [ ] LLM prompts are clear and produce consistent output
- [ ] Scenario diversity settings work as expected
- [ ] Token limits are respected
- [ ] Cost estimation is accurate
- [ ] Deterministic generation (for commands) is reproducible

</details>

<details>
<summary><strong>Stage 3: Execution</strong> (click to expand)</summary>

- [ ] Claude Agent SDK integration works correctly
- [ ] Tool capture via PreToolUse hooks functions properly
- [ ] Timeout handling works as expected
- [ ] Session isolation prevents cross-contamination
- [ ] Permission bypass works for automated execution

</details>

<details>
<summary><strong>Stage 4: Evaluation</strong> (click to expand)</summary>

- [ ] Programmatic detection correctly parses Skill/Task/SlashCommand tool calls
- [ ] LLM judge fallback works for edge cases
- [ ] Conflict detection identifies overlapping triggers
- [ ] Result aggregation methods work correctly
- [ ] Citations link to correct message IDs

</details>

## API & SDK Changes

<!-- Only relevant if you modified SDK integration -->

<details>
<summary><strong>SDK Integration</strong> (click to expand)</summary>

- [ ] Anthropic SDK usage follows current API patterns
- [ ] Claude Agent SDK integration maintains compatibility
- [ ] Retry logic handles transient API errors gracefully
- [ ] Token/cost estimation remains accurate
- [ ] Rate limiting is respected

</details>

## Example Output (if applicable)

<!-- Add example CLI output or JSON results to help explain your changes -->
<!-- Use code blocks for formatted output -->

```text
# Example: paste relevant CLI output here
```

## Additional Notes

<!-- Add any other context about the pull request here -->

## Reviewer Notes

<!-- Information specifically for the reviewer -->

**Areas that need special attention**:

<!-- List any specific areas you'd like reviewers to focus on -->

**Known limitations or trade-offs**:

<!-- Describe any known issues or compromises made -->

---

## Pre-Merge Checklist (for maintainers)

- [ ] All CI checks pass
- [ ] Test coverage thresholds maintained
- [ ] No security vulnerabilities introduced
- [ ] API/SDK compatibility verified
- [ ] Breaking changes are clearly documented
- [ ] CLAUDE.md updated if needed
- [ ] Labels are appropriate for the change type
