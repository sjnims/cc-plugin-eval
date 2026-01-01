---
name: test-agent
model: inherit
tools: Read, Grep
---

Use this agent when the user asks to "analyze code quality" or "review my code".

<example>
Context: User has written new code
user: "Review my code"
assistant: "I'll use the test-agent to analyze your code."
<commentary>Explicit request for code review triggers agent.</commentary>
</example>

<example>
Context: User mentions code quality
user: "Can you check if my code follows best practices?"
assistant: "Let me analyze your code for best practices."
<commentary>Implicit request for quality analysis.</commentary>
</example>
