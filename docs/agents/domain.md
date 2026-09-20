# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** and **`PROJECT_STATE.md`** at the repo root.
- **`DECISIONS.md`** and **`docs/adr/`**: read architectural decisions that touch the area you're about to work in.
- **`GEMINI.md`**: workspace rules and domain invariants (Render deployment, academic attendance rules, documentation invariants).

If `CONTEXT.md` does not yet exist, proceed silently. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates terms lazily when decisions get resolved.

## File structure

Single-context repo:

```
/
├── README.md
├── PROJECT_STATE.md
├── DECISIONS.md
├── GEMINI.md
├── PRODUCT.md
├── DESIGN.md
├── code_engineer.md
└── docs/agents/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the terms as defined in `CONTEXT.md` and `GEMINI.md` (e.g. course-scoped attendees, ISO-8601 weekly isolation).

## Flag ADR conflicts

If your output contradicts an existing ADR in `docs/adr/` or `DECISIONS.md`, surface it explicitly rather than silently overriding.
