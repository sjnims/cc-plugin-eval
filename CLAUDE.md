# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

cc-plugin-eval is a 4-stage evaluation framework for testing Claude Code plugin component triggering. It evaluates whether skills, agents, commands, hooks, and MCP servers correctly activate when expected.

**Requirements**: Node.js >= 20.0.0, Anthropic API key

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build
npm run build          # Compiles TypeScript to dist/
npm run dev            # Watch mode - recompiles on changes

# Lint & Type Check
npm run lint           # ESLint with TypeScript strict rules
npm run lint:fix       # Auto-fix linting issues
npm run typecheck      # tsc --noEmit

# Test
npm run test           # Run all tests with Vitest
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
npm run test:ui        # Vitest UI in browser

# Run a single test file
npx vitest run tests/unit/stages/1-analysis/skill-analyzer.test.ts

# Run tests matching a pattern
npx vitest run -t "SkillAnalyzer"
```

## Additional Linters

Run before committing:

```bash
# Prettier (code formatting)
npx prettier --check "src/**/*.ts" "*.json" "*.md"
npx prettier --write "src/**/*.ts" "*.json" "*.md"

# Markdown
markdownlint "*.md"
markdownlint --fix "*.md"

# YAML
uvx yamllint -c .yamllint.yml seed.yaml .yamllint.yml

# GitHub Actions
actionlint .github/workflows/*.yml
```

## CLI Usage

```bash
# Full pipeline evaluation
cc-plugin-eval run -p ./path/to/plugin

# Individual stages
cc-plugin-eval analyze -p ./path/to/plugin    # Stage 1 only
cc-plugin-eval generate -p ./path/to/plugin   # Stages 1-2
cc-plugin-eval execute -p ./path/to/plugin    # Stages 1-3

# Dry-run (cost estimation only)
cc-plugin-eval run -p ./plugin --dry-run

# Resume interrupted run
cc-plugin-eval resume -r <run-id>
```

## Architecture

### 4-Stage Pipeline

```text
Stage 1: Analysis → Stage 2: Generation → Stage 3: Execution → Stage 4: Evaluation
```

| Stage             | Purpose                                                                   | Output            |
| ----------------- | ------------------------------------------------------------------------- | ----------------- |
| **1. Analysis**   | Parse plugin structure, extract triggers                                  | `analysis.json`   |
| **2. Generation** | Create test scenarios (LLM for skills/agents, deterministic for commands) | `scenarios.json`  |
| **3. Execution**  | Run scenarios via Claude Agent SDK with tool capture                      | `transcripts/`    |
| **4. Evaluation** | Programmatic detection first, LLM judge for quality                       | `evaluation.json` |

### Key Directory Structure

```text
src/
├── index.ts              # CLI entry point (env.js MUST be first import)
├── env.ts                # Environment setup (dotenv with quiet: true)
├── config/               # YAML/JSON config loading with Zod validation
├── stages/
│   ├── 1-analysis/       # Plugin parsing, trigger extraction
│   ├── 2-generation/     # Scenario generation (LLM + deterministic)
│   ├── 3-execution/      # Agent SDK integration, tool capture via hooks
│   └── 4-evaluation/     # Programmatic detection, LLM judge, conflict tracking
├── state/                # Resume capability, checkpoint management
├── types/                # TypeScript interfaces
└── utils/                # Retry, concurrency, logging, file I/O
```

### Detection Strategy

**Programmatic detection is primary** - parse `Skill`, `Task`, and `SlashCommand` tool calls from transcripts for 100% confidence detection. LLM judge is secondary, used only for quality assessment and edge cases where programmatic detection fails.

### Two SDK Integration Points

1. **Anthropic SDK** (`@anthropic-ai/sdk`) - Used in Stages 2 and 4 for LLM calls (scenario generation, judgment)
2. **Agent SDK** (`@anthropic-ai/claude-agent-sdk`) - Used in Stage 3 for execution with plugin loading

### Environment Setup

Create `.env` with:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Critical**: `import './env.js'` must be the FIRST import in `src/index.ts` to load environment variables before other modules. The `env.ts` module configures dotenv with `quiet: true` to suppress v17+ runtime logging.

## Configuration

Main config is `seed.yaml`. Key settings:

- `scope`: Enable/disable skill, agent, command, hook, MCP evaluation
- `generation.diversity`: 0-1 ratio controlling base scenarios vs variations
- `execution.disallowed_tools`: Block Write/Edit/Bash during evaluation
- `evaluation.detection_mode`: `programmatic_first` (default) or `llm_only`

## Code Conventions

- ESM modules with NodeNext resolution
- Strict TypeScript (all strict flags enabled, `noUncheckedIndexedAccess`)
- Explicit return types on all functions
- Import order enforced by ESLint: builtin → external → internal → parent → sibling (alphabetized within groups)
- Prefix unused parameters with `_`
- Use `type` imports for type-only imports (`import type { Foo }` or `import { type Foo }`)
- Coverage thresholds: 78% lines/statements, 75% functions, 65% branches

## Key Implementation Details

- **Retry with exponential backoff** in `src/utils/retry.ts` for transient API errors
- **Semaphore-based concurrency** in `src/utils/concurrency.ts` for parallel execution
- **Model pricing externalized** in `src/config/pricing.ts` for easy updates
- **State checkpointing** after each stage enables resume on interruption
- **Tool capture via PreToolUse hooks** during SDK execution for programmatic detection

## Implementation Patterns

### Custom Error Classes with Cause Chains

```typescript
// Pattern in src/config/loader.ts
export class ConfigLoadError extends Error {
  override readonly cause?: Error | undefined;
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ConfigLoadError";
    this.cause = cause;
  }
}
// Usage: throw new ConfigLoadError("Failed to read config", originalError);
```

### Type Guards for Tool Detection

```typescript
// Pattern in src/stages/4-evaluation/programmatic-detector.ts
function isSkillInput(input: unknown): input is SkillToolInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "skill" in input &&
    typeof (input as SkillToolInput).skill === "string"
  );
}
```

### Handler Map for Stage-Based Resume

```typescript
// Pattern in src/index.ts - polymorphic dispatch based on pipeline stage
const resumeHandlers: Record<PipelineStage, ResumeHandler> = {
  pending: resumeFromAnalysis,
  analysis: resumeFromAnalysis,
  generation: resumeFromGeneration,
  execution: resumeFromExecution,
  evaluation: resumeFromEvaluation,
  complete: resumeFromEvaluation,
};
// State files stored at: results/<plugin-name>/<run-id>/state.json
```
