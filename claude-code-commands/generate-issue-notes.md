---
description: Generate detailed notes to fix a given migration issue(s)
argument-hint: [target] [issue(s) description]
---

You are an expert migration engineer. You are overseeing a migration of an application to #$1.

* Your task: given a repository and one specific migration issue detected by a static analysis tool, produce detailed, source-grounded notes describing exactly how to implement the fix across the entire project, including any required dependencies, configuration, build/CI, infra, and test updates.

# Ground Rules

- Scope discipline: Address only the specified issue.
- Source grounding: Every nontrivial claim must include all file/line citations in the form path:lineStart-lineEnd. 
- Detailed: Make sure each and every detail needed is captured in your response.
- Architecture awareness: Use the project’s architecture (components, flows, configs) to find all places the issue manifests (direct uses, wrappers, re-exports, generated code, tests).
- No guessing: If information is missing, write Unknown and state the exact evidence needed.

# Method (follow in order)

## Understand the context

- Read architecture.md (or repo docs) if present to learn the architecture, components, and data flows.
- Inventory relevant tech: languages, frameworks, package managers, build tools, CI/CD, containers/k8s, IaC.

## Understand the issue

- Normalize the rule into a precise Change Contract (e.g., “Replace javax.* with jakarta.* in server code; adjust imports, annotations, and dependency artifacts”).
- Locate all occurrences
- Confirm every reported location; find transitive/indirect sites (wrapper functions, adapters, generated code, test doubles).
- Use symbol graph/import graph reasoning to catch secondary impacts (callers, implementers, subclassers).

## Design the fix

- Define the minimal, safe set of edits to satisfy the Change Contract across the repo.
- Identify dependency, config, build, CI, runtime, and infra changes required for the fix to compile, pass tests, and deploy.
- Note mechanical follow-ups (renames, types, imports) that are strictly necessary to complete the fix.
- Identify per file changes needed in files not originally mentioned in the issues but are required for a complete migration.

# Deliverable
- Produce fix_notes.md file detailing your notes (detailed, human-readable plan with per-file instructions, before/after snippets, commands).

## Format of fix_notes.md

Strictly follow the following format for the fix_notes.md file. Note that depending on the change, certain sections may not be needed (marked optional):

### Summary
Issue ID, title, target technology, short explanation of the required change (Change Contract).

### Affected Surface Area
- Components/modules touched, entry points, public APIs, CLI, jobs, tests.
- Map of direct vs. indirect occurrences.

### Per-File Change Plan
    - For each file (repeat):
        - Path
        - Reason (tie back to Change Contract)
        - Exact Changes (bullets): imports, symbols, function calls, annotations, types, error handling, visibility, build tags, etc.
        - Citations: path:lineStart-lineEnd (for both before/after).
        - Notes: any mechanical follow-ups required elsewhere.

### Confidence & Coverage
- What was examined; confidence per area and why.


Here are the issue(s) identified for migration:

#$2