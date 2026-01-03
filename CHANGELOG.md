# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-02

### Added

- Initial 4-stage evaluation pipeline (Analysis → Generation → Execution → Evaluation)
- Support for skills, agents, and commands evaluation
- Programmatic detection via tool capture parsing
- LLM judge for quality assessment with multi-sampling
- Resume capability with state checkpointing
- Cost estimation before execution (dry-run mode)
- Multiple output formats (JSON, YAML, JUnit XML, TAP)
- Semantic variation testing for trigger robustness
- Rate limiter for API call protection (#32)
- Symlink resolution for plugin path validation (#33)
- PII filtering for verbose transcript logging (#34)
- Custom sanitization regex pattern validation (#46)
- Comprehensive test suite with 943 tests and 93%+ coverage

### Changed

- Tuning configuration extracted from hardcoded values (#26)
- Renamed seed.yaml to config.yaml for clarity (#25)

### Fixed

- Correct Anthropic structured output API usage in LLM judge (#9)
- Variance propagation from runJudgment to metrics (#30)
- Centralized logger and pricing utilities (#43)

[Unreleased]: https://github.com/sjnims/cc-plugin-eval/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sjnims/cc-plugin-eval/releases/tag/v0.1.0
