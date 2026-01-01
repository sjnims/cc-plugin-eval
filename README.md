# cc-plugin-eval

[![CI](https://github.com/sjnims/cc-plugin-eval/actions/workflows/ci.yml/badge.svg)](https://github.com/sjnims/cc-plugin-eval/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

A 4-stage evaluation framework for testing Claude Code plugin component triggering. Validates whether skills, agents, commands, hooks, and MCP servers correctly activate when expected.

## Why This Exists

Claude Code plugins contain multiple component types (skills, agents, commands) that trigger based on user prompts. Testing these triggers manually is time-consuming and error-prone. This framework automates the entire evaluation process:

- **Discovers** all components in your plugin
- **Generates** test scenarios (positive and negative cases)
- **Executes** scenarios against the Claude Agent SDK
- **Evaluates** whether the correct component triggered

## Features

- **4-Stage Pipeline**: Analysis → Generation → Execution → Evaluation
- **Multi-Component Support**: Skills, agents, and commands (hooks/MCP coming soon)
- **Programmatic Detection**: 100% confidence detection by parsing tool captures
- **Semantic Testing**: Synonym and paraphrase variations to test trigger robustness
- **Resume Capability**: Checkpoint after each stage, resume interrupted runs
- **Cost Estimation**: Token and USD estimates before execution
- **Multiple Output Formats**: JSON, YAML, JUnit XML, TAP

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- An Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/sjnims/cc-plugin-eval.git
cd cc-plugin-eval

# Install dependencies
npm install

# Build
npm run build

# Create .env file
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env
```

### Run Your First Evaluation

```bash
# Full pipeline evaluation
npx cc-plugin-eval run -p ./path/to/your/plugin

# Dry-run to see cost estimates without execution
npx cc-plugin-eval run -p ./path/to/your/plugin --dry-run
```

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           cc-plugin-eval Pipeline                           │
└─────────────────────────────────────────────────────────────────────────────┘

  Plugin Directory
        │
        ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Stage 1:    │    │   Stage 2:    │    │   Stage 3:    │    │   Stage 4:    │
│   Analysis    │───▶│  Generation   │───▶│  Execution    │───▶│  Evaluation   │
│               │    │               │    │               │    │               │
│ Parse plugin  │    │ Create test   │    │ Run scenarios │    │ Detect which  │
│ structure,    │    │ scenarios     │    │ via Agent SDK │    │ components    │
│ extract       │    │ (positive &   │    │ with tool     │    │ triggered,    │
│ triggers      │    │ negative)     │    │ capture       │    │ calculate     │
│               │    │               │    │               │    │ metrics       │
└───────────────┘    └───────────────┘    └───────────────┘    └───────────────┘
        │                    │                    │                    │
        ▼                    ▼                    ▼                    ▼
   analysis.json       scenarios.json       transcripts/        evaluation.json
```

### Stage Details

| Stage             | Purpose                                         | Method                                            | Output            |
| ----------------- | ----------------------------------------------- | ------------------------------------------------- | ----------------- |
| **1. Analysis**   | Parse plugin structure, extract trigger phrases | Deterministic parsing                             | `analysis.json`   |
| **2. Generation** | Create test scenarios                           | LLM for skills/agents, deterministic for commands | `scenarios.json`  |
| **3. Execution**  | Run scenarios against Claude Agent SDK          | PreToolUse hook captures                          | `transcripts/`    |
| **4. Evaluation** | Detect triggers, calculate metrics              | Programmatic first, LLM judge for quality         | `evaluation.json` |

### Scenario Types

Each component generates multiple scenario types to thoroughly test triggering:

| Type          | Description                  | Example                                |
| ------------- | ---------------------------- | -------------------------------------- |
| `direct`      | Exact trigger phrase         | "create a skill"                       |
| `paraphrased` | Same intent, different words | "add a new skill to my plugin"         |
| `edge_case`   | Unusual but valid            | "skill plz"                            |
| `negative`    | Should NOT trigger           | "tell me about database skills"        |
| `semantic`    | Synonym variations           | "generate a skill" vs "create a skill" |

## CLI Commands

### Full Pipeline

```bash
# Run complete evaluation
cc-plugin-eval run -p ./plugin

# With options
cc-plugin-eval run -p ./plugin \
  --config custom-seed.yaml \
  --verbose \
  --samples 3
```

### Individual Stages

```bash
# Stage 1: Analysis only
cc-plugin-eval analyze -p ./plugin

# Stages 1-2: Analysis + Generation
cc-plugin-eval generate -p ./plugin

# Stages 1-3: Analysis + Generation + Execution
cc-plugin-eval execute -p ./plugin
```

### Resume & Reporting

```bash
# Resume an interrupted run
cc-plugin-eval resume -r <run-id>

# List previous runs
cc-plugin-eval list -p ./plugin

# Generate report from existing results
cc-plugin-eval report -r <run-id> --output junit-xml
```

### Key Options

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `-p, --plugin <path>` | Plugin directory path                             |
| `-c, --config <path>` | Config file (default: `seed.yaml`)                |
| `--dry-run`           | Generate scenarios without execution              |
| `--verbose`           | Enable debug output                               |
| `--fast`              | Only run previously failed scenarios              |
| `--semantic`          | Enable semantic variation testing                 |
| `--samples <n>`       | Multi-sample judgment count                       |
| `--reps <n>`          | Repetitions per scenario                          |
| `--output <format>`   | Output format: `json`, `yaml`, `junit-xml`, `tap` |

## Configuration

Configuration is managed via `seed.yaml`. Key sections:

```yaml
# Which component types to evaluate
scope:
  skills: true
  agents: true
  commands: true
  hooks: false # Coming in Phase 2
  mcp_servers: false # Coming in Phase 3

# Scenario generation settings
generation:
  model: "claude-sonnet-4-5-20250929"
  scenarios_per_component: 5
  diversity: 0.7 # Ratio of base scenarios to variations
  semantic_variations: true

# Execution settings
execution:
  model: "claude-sonnet-4-20250514"
  max_turns: 5
  timeout_ms: 60000
  max_budget_usd: 10.0
  disallowed_tools: [Write, Edit, Bash] # Safety: block file operations

# Evaluation settings
evaluation:
  model: "claude-sonnet-4-5-20250929"
  detection_mode: "programmatic_first" # Or "llm_only"
  num_samples: 1 # Multi-sample judgment
```

See the full [`seed.yaml`](./seed.yaml) for all options.

## Output Structure

After a run, results are saved to:

```text
results/
└── {plugin-name}/
    └── {run-id}/
        ├── state.json              # Pipeline state (for resume)
        ├── analysis.json           # Stage 1: Parsed components
        ├── scenarios.json          # Stage 2: Generated test cases
        ├── execution-metadata.json # Stage 3: Execution stats
        ├── evaluation.json         # Stage 4: Results & metrics
        └── transcripts/
            └── {scenario-id}.json  # Individual execution transcripts
```

### Sample Evaluation Output

```json
{
  "results": [
    {
      "scenario_id": "skill-create-direct-001",
      "triggered": true,
      "confidence": 100,
      "quality_score": 9.2,
      "detection_source": "programmatic",
      "has_conflict": false
    }
  ],
  "metrics": {
    "total_scenarios": 25,
    "accuracy": 0.92,
    "trigger_rate": 0.88,
    "avg_quality": 8.7,
    "conflict_count": 1
  }
}
```

## Detection Strategy

**Programmatic detection is primary** for maximum accuracy:

1. During execution, PreToolUse hooks capture all tool invocations
2. Tool captures are parsed to detect `Skill`, `Task`, and `SlashCommand` calls
3. Component names are matched against expected triggers
4. Confidence is 100% for programmatic detection

**LLM judge is secondary**, used for:

- Quality assessment (0-10 score)
- Edge cases where programmatic detection is ambiguous
- Multi-sample consensus when configured

## Development

### Build & Test

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Type check
npm run typecheck
```

### Run a Single Test

```bash
npx vitest run tests/unit/stages/1-analysis/skill-analyzer.test.ts
npx vitest run -t "SkillAnalyzer"
```

### Project Structure

```text
src/
├── index.ts              # CLI entry point
├── config/               # Configuration loading & validation
├── stages/
│   ├── 1-analysis/       # Plugin parsing, trigger extraction
│   ├── 2-generation/     # Scenario generation
│   ├── 3-execution/      # Agent SDK integration
│   └── 4-evaluation/     # Detection & metrics
├── state/                # Resume capability
├── types/                # TypeScript interfaces
└── utils/                # Retry, concurrency, logging
```

## Roadmap

- [x] Phase 1: Skills, agents, commands evaluation
- [ ] Phase 2: Hooks evaluation
- [ ] Phase 3: MCP servers evaluation
- [ ] Phase 4: Cross-plugin conflict detection
- [ ] Phase 5: Marketplace evaluation

## License

MIT

## Author

Steve Nims ([@sjnims](https://github.com/sjnims))
