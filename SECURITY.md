# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

### Private Vulnerability Reporting

This repository has GitHub's private vulnerability reporting enabled:

1. Go to the [Security tab](https://github.com/sjnims/cc-plugin-eval/security) of this repository
2. Click "Report a vulnerability"
3. Fill out the vulnerability report form

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

### Response Timeline

| Phase                 | Timeline              |
| --------------------- | --------------------- |
| Initial response      | Within 48 hours       |
| Triage and assessment | Within 1 week         |
| Fix development       | Depends on severity   |
| Public disclosure     | After fix is released |

## Security Considerations

This tool executes LLM-generated scenarios against the Claude Agent SDK. Built-in safeguards include:

### Execution Safeguards

- **Disallowed tools**: Configure `execution.disallowed_tools` in `config.yaml` to block dangerous tools (e.g., `Write`, `Edit`, `Bash`)
- **Budget limits**: Set `execution.max_budget_usd` to cap API spending
- **Timeout limits**: Set `execution.timeout_ms` to prevent runaway executions
- **Session isolation**: Enable `execution.session_isolation` to prevent cross-scenario contamination

### API Key Security

- Store your `ANTHROPIC_API_KEY` in `.env` (gitignored)
- Never commit API keys to the repository
- Use environment variables in CI/CD pipelines

## Security Update Process

Security updates are released as patch versions and announced via:

- GitHub Security Advisories
- Release notes
