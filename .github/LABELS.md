# Label Management

This document describes the label system for cc-plugin-eval.

## Files

- **labels.yml**: Source of truth for all repository labels
- **LABELS.md**: This documentation file

## Label Categories

### Type Labels

Standard GitHub labels for issue/PR classification:

| Label           | Color                                                    | Description                   |
| --------------- | -------------------------------------------------------- | ----------------------------- |
| `bug`           | ![#d73a4a](https://placehold.co/15x15/d73a4a/d73a4a.png) | Something isn't working       |
| `documentation` | ![#0075ca](https://placehold.co/15x15/0075ca/0075ca.png) | Documentation improvements    |
| `duplicate`     | ![#cfd3d7](https://placehold.co/15x15/cfd3d7/cfd3d7.png) | Already exists                |
| `enhancement`   | ![#a2eeef](https://placehold.co/15x15/a2eeef/a2eeef.png) | New feature or request        |
| `invalid`       | ![#e4e669](https://placehold.co/15x15/e4e669/e4e669.png) | Doesn't seem right            |
| `question`      | ![#d876e3](https://placehold.co/15x15/d876e3/d876e3.png) | Further information requested |
| `refactor`      | ![#fef65b](https://placehold.co/15x15/fef65b/fef65b.png) | Code restructuring            |
| `chore`         | ![#c5def5](https://placehold.co/15x15/c5def5/c5def5.png) | Maintenance tasks             |
| `wontfix`       | ![#ffffff](https://placehold.co/15x15/ffffff/ffffff.png) | Will not be worked on         |

### Pipeline Stage Labels

Labels for the 4-stage evaluation pipeline. Colors follow a progression theme (blue → green):

| Label              | Color                                                    | Description                                 |
| ------------------ | -------------------------------------------------------- | ------------------------------------------- |
| `stage:analysis`   | ![#1e88e5](https://placehold.co/15x15/1e88e5/1e88e5.png) | Stage 1: Plugin parsing, trigger extraction |
| `stage:generation` | ![#26a69a](https://placehold.co/15x15/26a69a/26a69a.png) | Stage 2: Test scenario generation           |
| `stage:execution`  | ![#ff8f00](https://placehold.co/15x15/ff8f00/ff8f00.png) | Stage 3: Agent SDK execution                |
| `stage:evaluation` | ![#43a047](https://placehold.co/15x15/43a047/43a047.png) | Stage 4: Detection and judgment             |

### Component Labels

Labels for infrastructure modules (grey/neutral tones):

| Label              | Color                                                    | Description                                |
| ------------------ | -------------------------------------------------------- | ------------------------------------------ |
| `component:cli`    | ![#455a64](https://placehold.co/15x15/455a64/455a64.png) | CLI entry point and pipeline orchestration |
| `component:config` | ![#8d6e63](https://placehold.co/15x15/8d6e63/8d6e63.png) | Configuration loading                      |
| `component:state`  | ![#78909c](https://placehold.co/15x15/78909c/78909c.png) | Resume/checkpoint management               |
| `component:utils`  | ![#90a4ae](https://placehold.co/15x15/90a4ae/90a4ae.png) | Utilities (retry, concurrency)             |
| `component:types`  | ![#cfd8dc](https://placehold.co/15x15/cfd8dc/cfd8dc.png) | TypeScript interfaces                      |

### Scope Labels

Labels for plugin component types being evaluated (warm coral/pink family):

| Label            | Color                                                    | Description                     |
| ---------------- | -------------------------------------------------------- | ------------------------------- |
| `scope:skills`   | ![#e91e63](https://placehold.co/15x15/e91e63/e91e63.png) | Skill triggering evaluation     |
| `scope:agents`   | ![#f44336](https://placehold.co/15x15/f44336/f44336.png) | Agent triggering evaluation     |
| `scope:commands` | ![#ff5722](https://placehold.co/15x15/ff5722/ff5722.png) | Command triggering evaluation   |
| `scope:hooks`    | ![#ff7043](https://placehold.co/15x15/ff7043/ff7043.png) | Hook evaluation (Phase 2)       |
| `scope:mcp`      | ![#ff8a65](https://placehold.co/15x15/ff8a65/ff8a65.png) | MCP server evaluation (Phase 3) |

### SDK Labels

Labels for Anthropic SDK integrations:

| Label           | Color                                                    | Description                  |
| --------------- | -------------------------------------------------------- | ---------------------------- |
| `sdk:anthropic` | ![#cc785c](https://placehold.co/15x15/cc785c/cc785c.png) | Anthropic SDK (Stages 2 & 4) |
| `sdk:agent`     | ![#7e57c2](https://placehold.co/15x15/7e57c2/7e57c2.png) | Claude Agent SDK (Stage 3)   |

### Priority Labels

Urgency classification (heat map: hot → cool):

| Label               | Color                                                    | Description                     |
| ------------------- | -------------------------------------------------------- | ------------------------------- |
| `priority:critical` | ![#b60205](https://placehold.co/15x15/b60205/b60205.png) | Blocking, security, or breaking |
| `priority:high`     | ![#d93f0b](https://placehold.co/15x15/d93f0b/d93f0b.png) | Important but not blocking      |
| `priority:medium`   | ![#fbca04](https://placehold.co/15x15/fbca04/fbca04.png) | Should be addressed             |
| `priority:low`      | ![#0e8a16](https://placehold.co/15x15/0e8a16/0e8a16.png) | Nice to have                    |

### Status Labels

Current work state:

| Label                 | Color                                                    | Description              |
| --------------------- | -------------------------------------------------------- | ------------------------ |
| `status:blocked`      | ![#e99695](https://placehold.co/15x15/e99695/e99695.png) | Blocked by dependencies  |
| `status:in-progress`  | ![#90caf9](https://placehold.co/15x15/90caf9/90caf9.png) | Work in progress         |
| `status:needs-review` | ![#fff3b3](https://placehold.co/15x15/fff3b3/fff3b3.png) | Ready for review         |
| `status:needs-repro`  | ![#f9c4f4](https://placehold.co/15x15/f9c4f4/f9c4f4.png) | Needs reproduction steps |
| `status:needs-design` | ![#c5cae9](https://placehold.co/15x15/c5cae9/c5cae9.png) | Needs design decision    |

### Effort Labels

Time estimates:

| Label           | Color                                                    | Description |
| --------------- | -------------------------------------------------------- | ----------- |
| `effort:small`  | ![#c2e0c6](https://placehold.co/15x15/c2e0c6/c2e0c6.png) | < 1 hour    |
| `effort:medium` | ![#bfdadc](https://placehold.co/15x15/bfdadc/bfdadc.png) | 1-4 hours   |
| `effort:large`  | ![#f9d0c4](https://placehold.co/15x15/f9d0c4/f9d0c4.png) | > 4 hours   |

### Testing Labels

Test-related work (green family):

| Label              | Color                                                    | Description              |
| ------------------ | -------------------------------------------------------- | ------------------------ |
| `test:unit`        | ![#81c784](https://placehold.co/15x15/81c784/81c784.png) | Unit test changes        |
| `test:integration` | ![#4caf50](https://placehold.co/15x15/4caf50/4caf50.png) | Integration test changes |
| `test:coverage`    | ![#388e3c](https://placehold.co/15x15/388e3c/388e3c.png) | Coverage improvements    |

### Special Labels

Framework-specific concerns:

| Label                | Color                                                    | Description                     |
| -------------------- | -------------------------------------------------------- | ------------------------------- |
| `breaking`           | ![#bd2130](https://placehold.co/15x15/bd2130/bd2130.png) | Breaking change                 |
| `security`           | ![#ee0701](https://placehold.co/15x15/ee0701/ee0701.png) | Security-related                |
| `performance`        | ![#00acc1](https://placehold.co/15x15/00acc1/00acc1.png) | Performance improvements        |
| `cost-impact`        | ![#ffa726](https://placehold.co/15x15/ffa726/ffa726.png) | Affects API costs/budget        |
| `detection`          | ![#4db6ac](https://placehold.co/15x15/4db6ac/4db6ac.png) | Programmatic detection logic    |
| `llm-judge`          | ![#9575cd](https://placehold.co/15x15/9575cd/9575cd.png) | LLM-based evaluation            |
| `resume`             | ![#64b5f6](https://placehold.co/15x15/64b5f6/64b5f6.png) | Resume/checkpoint functionality |
| `batch-processing`   | ![#29b6f6](https://placehold.co/15x15/29b6f6/29b6f6.png) | Batch API processing            |
| `conflict-detection` | ![#ef5350](https://placehold.co/15x15/ef5350/ef5350.png) | Cross-plugin conflicts          |

### Community Labels

| Label              | Color                                                    | Description                         |
| ------------------ | -------------------------------------------------------- | ----------------------------------- |
| `help wanted`      | ![#008672](https://placehold.co/15x15/008672/008672.png) | Extra attention needed              |
| `good first issue` | ![#7057ff](https://placehold.co/15x15/7057ff/7057ff.png) | Good for newcomers                  |
| `idea`             | ![#c5def5](https://placehold.co/15x15/c5def5/c5def5.png) | Community idea or suggestion        |
| `showcase`         | ![#bfd4f2](https://placehold.co/15x15/bfd4f2/bfd4f2.png) | Community showcase or demonstration |

### Triage Labels

| Label    | Color                                                    | Description                             |
| -------- | -------------------------------------------------------- | --------------------------------------- |
| `triage` | ![#ededed](https://placehold.co/15x15/ededed/ededed.png) | Needs initial review and categorization |

### Dependency Labels

| Label            | Color                                                    | Description            |
| ---------------- | -------------------------------------------------------- | ---------------------- |
| `dependencies`   | ![#0366d6](https://placehold.co/15x15/0366d6/0366d6.png) | Dependency updates     |
| `github-actions` | ![#000000](https://placehold.co/15x15/000000/000000.png) | GitHub Actions updates |
| `npm`            | ![#cb3837](https://placehold.co/15x15/cb3837/cb3837.png) | npm dependency updates |

### Workflow Labels

| Label     | Color                                                    | Description            |
| --------- | -------------------------------------------------------- | ---------------------- |
| `stale`   | ![#ededed](https://placehold.co/15x15/ededed/ededed.png) | No recent activity     |
| `pinned`  | ![#fef2c0](https://placehold.co/15x15/fef2c0/fef2c0.png) | Never mark as stale    |
| `roadmap` | ![#0e8a16](https://placehold.co/15x15/0e8a16/0e8a16.png) | Long-term roadmap item |

## Label Application Guidelines

### Required Labels

Every issue and PR should have:

1. **One type label**: bug, enhancement, documentation, refactor, chore, etc.
2. **One priority label**: priority:critical, priority:high, priority:medium, priority:low
3. **One effort label**: effort:small, effort:medium, effort:large

### Contextual Labels

Apply when relevant:

- **Stage labels**: When the change affects specific pipeline stages
- **Component labels**: When the change affects specific infrastructure modules
- **Scope labels**: When the change affects evaluation of specific plugin component types
- **SDK labels**: When the change involves Anthropic SDK or Agent SDK integration
- **Testing labels**: When the change involves test modifications
- **Special labels**: When the change has performance, cost, security, or breaking implications

### Label Combinations

Common label combinations for cc-plugin-eval:

| Scenario               | Labels                                                  |
| ---------------------- | ------------------------------------------------------- |
| Bug in Stage 1 parsing | `bug`, `stage:analysis`, `priority:*`, `effort:*`       |
| New detection method   | `enhancement`, `stage:evaluation`, `detection`          |
| SDK upgrade            | `chore`, `sdk:anthropic` or `sdk:agent`, `dependencies` |
| Cost optimization      | `enhancement`, `performance`, `cost-impact`             |
| Resume feature fix     | `bug`, `component:state`, `resume`                      |
| Coverage improvement   | `chore`, `test:coverage`, `effort:*`                    |

## Managing Labels

### Adding a New Label

1. **Update labels.yml**:

   ```yaml
   - name: "new-label"
     color: "hexcode"
     description: "Description here"
   ```

2. **Update LABELS.md** with the new label documentation

3. **Apply manually** (until sync workflow is added):

   ```bash
   gh label create "new-label" --color "hexcode" --description "Description here"
   ```

### Updating a Label

1. **Update labels.yml** with new color/description

2. **Apply manually**:

   ```bash
   gh label edit "label-name" --color "new-color" --description "new description"
   ```

### Deleting a Label

1. **Remove from labels.yml**

2. **Delete from GitHub**:

   ```bash
   gh label delete "label-name" --yes
   ```

### Bulk Sync

To sync all labels from labels.yml:

```bash
# List current labels
gh label list

# Create/update each label from labels.yml
# (Manual process until sync workflow is added)
```

## Color Scheme Rationale

| Category        | Color Family           | Rationale                                              |
| --------------- | ---------------------- | ------------------------------------------------------ |
| Pipeline Stages | Blue → Green gradient  | Progression from analysis to completion                |
| Components      | Grey/neutral tones     | Infrastructure, foundational                           |
| Scope           | Warm coral/pink        | Distinct from stages, represents "what's being tested" |
| SDK             | Purple/terracotta      | Tech-specific, Anthropic-inspired                      |
| Priority        | Heat map (red → green) | Intuitive urgency indication                           |
| Testing         | Green family           | Validation, success theme                              |
| Special         | Varied                 | Each has semantic meaning                              |

## Label Naming Conventions

- **Prefixed labels**: Use colons for categories (`stage:`, `component:`, `scope:`, `priority:`, `status:`, `effort:`, `test:`, `sdk:`)
- **Standard labels**: Keep GitHub defaults as-is (`bug`, `help wanted`)
- **Multi-word labels**: Use hyphens (`good-first-issue` exception: keep space for GitHub ecosystem compatibility)
- **Case**: All lowercase

## Label Count

Current total: **~54 labels**

This is slightly more than typical due to the framework's multi-dimensional nature (stages + components + scopes), but each category is clearly organized and serves a distinct purpose.
