import { type BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { type AgentInput, type AgentResult } from "./types";

/**
 * Runs the completeness evaluation agent
 */
export async function runCompletenessAgent(
  input: AgentInput,
): Promise<AgentResult> {
  const { testCase, evaluationTools, issues, model, logger } = input;
  const responses: BaseMessage[] = [];

  const COMPLETENESS_PROMPTS = {
    system:
      "You are a senior software engineer expert in migrating applications from one technology to another.",
    userSummarize: `You are reviewing a code change made to fix a migration issue identified by a static analysis tool.
You are provided with:
- The original issue description
- Developer notes describing the intended fix (consider these the only source of truth)
- Access to a set of tools that can inspect the codebase

## Your task

Determine how completely the code changes implement the fix as described in the developer notes—no more, no less.
Your job is to compare implementation (actual code) against intent (developer notes).

## Evaluation Rules

- Stick strictly to the notes when comparing. They are the authoritative reference.
- Do not assume additional requirements, behaviors, or conventions.
- Use tools thoughtfully. Only gather information necessary to confirm alignment between the notes and the actual code changes.
- Be specific. When identifying missing or incomplete work, clearly describe what evidence led you to that conclusion.
- Be concise but thorough. Focus on correctness and completeness.
- Refer explicitly to evidence from the codebase when making your assessment.
- Avoid subjective language like "it seems" or "probably".

There are three possible outcomes for your evaluation:

1. COMPLETELY_FIXED:
   - All changes described in the notes are present and correctly implemented.
   - No missing, incorrect, or contradictory work remains.
2. PARTIALLY_FIXED:
   - Some changes described in the notes are implemented, but at least one required modification is missing, incorrect, or incomplete.
3. UNFIXED:
   - *None* of the changes described in the notes are addressed.
   - OR, the changes leave the code in a broken state.

## Output Format

If the issue is completely fixed, respond in the following format:

\`\`\`
COMPLETELY_FIXED

<Brief summary explaining how the implemented changes align exactly with the notes and fully resolve the issue.>
\`\`\`

If the issue is partially fixed, identify outstanding changes. Try to group them logically together to keep the changes distinct.
Respond in the following format:

\`\`\`
PARTIALLY_FIXED

<Brief summary explaining why the fix is incomplete or incorrect, and what parts are missing or deviate from the notes.>

## Outstanding issues

1. <First issue summary>
2. <Second issue summary>
...
\`\`\`

If the issue is not fixed at all, respond in the following format:

\`\`\`
UNFIXED

<Brief summary explaining why you think the issue is completely unfixed.>
\`\`\`

Here are your inputs:
## The issues identified were:
${issues}

## Here are the notes about the issues:
${testCase.notes}

## Migration context:
${testCase.migrationHint}`,

    userRate: `We used a static analysis tool to identify migration issues in the application. We fixed the issues and asked a senior software engineer to review the changes. The engineer reviewed the changes and provided a summary of the changes made.

## Your task

Your goal is to:

- Analyze each *distinct unresolved issue* described in the summary.
- Assess the complexity of fixing each issue for given application.
- Finally, provide a rating for every issue based on the following scale:
    - TRIVIAL_CHANGES_NEEDED: Requires only a few small, localized modifications to files in the codebase (e.g., renaming, updating a parameter, minor logic tweak, or adding a missing import).
    - COMPLEX_CHANGES_NEEDED: Requires multiple related changes across files, complex logic changes, or coordination between components or services.
    - REDESIGN_NEEDED: Indicates a fundamental design or architectural flaw requiring a significant refactor or reimplementation of core logic.

## Guidelines
- Focus only on issues explicitly described in the summary.
- Do not invent or infer new issues beyond what is stated.
- Use architectural reasoning (e.g., cross-file dependencies, data flow, API contracts) to decide the appropriate rating.
- Each issue should have a short justification describing why it falls into that category.
- Maintain objectivity — avoid vague or subjective language like "probably complex" or "seems fine."
- If there are no issues identified in the summary, rate the migration as COMPLETE.
- Look at architecture of the application to help you make the decision.

Produce your response in following format:

\`\`\`
---
<Issue title>
<Brief reasoning (2~3 lines) behind the rating.>
Rating: <TRIVIAL_CHANGES_NEEDED | COMPLEX_CHANGES_NEEDED | REDESIGN_NEEDED>
---
<Issue 2 title>
<Brief reasoning (2~3 lines) behind the rating.>
Rating: <TRIVIAL_CHANGES_NEEDED | COMPLEX_CHANGES_NEEDED | REDESIGN_NEEDED>
...
\`\`\`

Here are your inputs:

## Issues we fixed
${issues}

## Summary
{summary}

## Migration context:
${testCase.migrationHint}`,
  };

  try {
    const agent = createReactAgent({
      llm: model,
      tools: [
        evaluationTools.getAppArchitectureTool(),
        evaluationTools.getListChangedFilesTool(),
        evaluationTools.getFileContentTool(),
      ],
      messageModifier: COMPLETENESS_PROMPTS.system,
    });

    const response = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content: COMPLETENESS_PROMPTS.userSummarize,
          },
        ],
      },
      {
        recursionLimit: 50,
      },
    );

    const summarizedContent =
      response.messages[response.messages.length - 1].content;

    // Determine score based on response
    if (summarizedContent.toString().includes("UNFIXED")) {
      return {
        metric: {
          reasoning: summarizedContent.toString(),
          score: 0,
        },
        responses,
      };
    } else if (summarizedContent.toString().includes("COMPLETELY_FIXED")) {
      return {
        metric: {
          reasoning: summarizedContent.toString(),
          score: 1,
        },
        responses,
      };
    }

    // For partial fixes, run rating agent
    const rateAgent = createReactAgent({
      llm: model,
      tools: [evaluationTools.getAppArchitectureTool()],
      messageModifier: COMPLETENESS_PROMPTS.system,
    });

    const rateResponse = await rateAgent.invoke(
      {
        messages: [
          {
            role: "user",
            content: COMPLETENESS_PROMPTS.userRate.replace(
              "{summary}",
              summarizedContent.toString(),
            ),
          },
        ],
      },
      {
        recursionLimit: 50,
      },
    );

    responses.push(...rateResponse.messages);
    const ratingContent =
      rateResponse.messages[rateResponse.messages.length - 1].content;

    // Calculate score based on complexity ratings
    let score = 0.8; // Base score for partial fixes
    const METRICS = {
      TRIVIAL_CHANGES_NEEDED: 0.05,
      COMPLEX_CHANGES_NEEDED: 0.2,
      REDESIGN_NEEDED: 0.7,
    };

    const lines = ratingContent.toString().split("\n");
    for (const line of lines) {
      const match = line.match(/Rating:\s*([^\n\r*#]+)/);
      if (match) {
        const rating = match[1].trim();
        const deduction = METRICS[rating as keyof typeof METRICS] || 0;
        score -= deduction;
      }
    }

    return {
      metric: {
        reasoning: `${summarizedContent}\n\nRating Analysis:\n${ratingContent}`,
        score: Math.max(score + 0.2, 0), // Add base score and ensure non-negative
      },
      responses,
    };
  } catch (error) {
    logger.error("Error in completeness agent", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Runs the functional parity evaluation agent
 */
export async function runFunctionalParityAgent(
  input: AgentInput,
): Promise<AgentResult> {
  const { testCase, evaluationTools, issues, model, logger } = input;
  const responses: BaseMessage[] = [];

  const FUNCTIONAL_CORRECTNESS_PROMPTS = {
    system:
      "You are a senior engineering expert in migrating source code as well as reviewing source code.",
    userSummarize: `You are overseeing migration of a codebase.
You are evaluating whether the migrated code preserves the functional behavior of its pre-migration version.

You are given:
- The original migration issues being fixed.
- Various tools to access post migration artifacts such as changed files, contents of pre and post migration files, results of behavioral tests (if present) and more.

## Your task

Determine if the post-migration code behaves functionally equivalent to the pre-migration code.
Focus strictly on runtime behavior, input/output consistency, and side effects.
Ignore stylistic, architectural, or performance differences unless they alter functional outcomes.

* Evidence-driven only.
- Base all reasoning on observable evidence from code or test results.
- Never assume developer intent beyond provided inputs.

* Understand the baseline.
- Examine the pre-migration code for:
  - Control flow and data flow
  - API contracts and return values
  - Input constraints and edge-case handling
  - External side effects (I/O, state changes, dependencies)

* Compare precisely.
- For each changed function or module, verify:
  - Input/Output equivalence
  - Algorithmic logic and branching consistency
  - Data transformations and validation rules
  - Exception and error handling behavior
  - API interface and dependency interactions
- Anchor every claim to evidence (specific functions, variables, or test traces).
- Differentiate functional logic vs configuration/environment clearly.
- Avoid judgmental or speculative phrasing — report observations only.
- Use deterministic comparisons: "X no longer calls Y," "Return type changed from boolean to ResponseEntity," etc.

* Handle tests carefully.
- Ignore failures caused purely by environment/config differences (e.g., path changes, dependency injection mismatches).
- Treat failures that reflect logic or data regressions as evidence of non-equivalence.
- Even if the tests fail, carefully analyze the test code itself to see if the functionality its testing is preserved.

* Do not overreach.
- Do not infer new requirements, "intended" fixes, or performance expectations.
- This is not a code-quality or completeness evaluation — only functional equivalence.

## Output requirements

- Summarize concrete evidence for any differences affecting functionality.
- Group related findings into distinct, logically separate issues.
- Provide a rating for the functional parity based on the scale below:
  - EQUIVALENT
    - Full behavioral parity. All functional logic and data flow preserved.
    - All tests pass or only harness/config mismatches.
    - Identical algorithms, APIs, and side effects.
  - CLOSELY_EQUIVALENT
    - Parity in business logic; minor config or integration adjustments needed.
    - Failing tests traceable solely to environment or dependency setup.
    - Code identical except for platform-specific or annotation-level differences.
  - SOMEWHAT_EQUIVALENT
    - Core logic intact but minor deviations exist (e.g., missing validation, altered edge case).
    - Some functional tests fail; failures fixable via small code edits.
    - Small discrepancies in conditions, defaults, or error handling.
  - NOT_EQUIVALENT
    - Major behavioral divergence — functionality changed, omitted, or broken.
    - Tests fail due to true logic or data-flow regressions.
    - Missing branches, incorrect return paths, lost side effects, or altered API behavior.

Produce your output in format below:

\`\`\`
<Brief, objective reasoning for every distinct issue you found — reference specific files, functions, or behaviors as evidence.>

Rating: <EQUIVALENT | CLOSELY_EQUIVALENT | SOMEWHAT_EQUIVALENT | NOT_EQUIVALENT>
\`\`\`

Here are your inputs:

## Original issues
${issues}

## Migration context:
${testCase.migrationHint}

## Applicable behavioral tests
${testCase.testSelectors?.join(", ") || "Not available"}`,
  };

  try {
    const agent = createReactAgent({
      llm: model,
      tools: [
        evaluationTools.getAppArchitectureTool(),
        evaluationTools.getListChangedFilesTool(),
        evaluationTools.getFileContentTool(),
        evaluationTools.getListFilesTool(),
      ],
      messageModifier: FUNCTIONAL_CORRECTNESS_PROMPTS.system,
    });

    const response = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content: FUNCTIONAL_CORRECTNESS_PROMPTS.userSummarize,
          },
        ],
      },
      {
        recursionLimit: 50,
      },
    );

    responses.push(...response.messages);
    const content = response.messages[response.messages.length - 1].content;

    // Extract rating
    const ratingMatch = content.toString().match(/Rating:\s*([^\n\r*#]+)?/);
    if (!ratingMatch) {
      throw new Error("No rating found in functional parity response");
    }

    const rating = ratingMatch[1].trim();
    const RATINGS = {
      EQUIVALENT: 1.0,
      CLOSELY_EQUIVALENT: 0.75,
      SOMEWHAT_EQUIVALENT: 0.5,
      NOT_EQUIVALENT: 0.0,
    };

    const score = RATINGS[rating as keyof typeof RATINGS];
    if (score === undefined) {
      throw new Error(`Unknown rating: ${rating}`);
    }

    return {
      metric: {
        reasoning: content.toString(),
        score,
      },
      responses,
    };
  } catch (error) {
    logger.error("Error in functional parity agent", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Runs the residual effort evaluation agent
 */
export async function runResidualEffortAgent(
  input: AgentInput,
): Promise<AgentResult> {
  const { testCase, evaluationTools, issues, model, logger } = input;
  const responses: BaseMessage[] = [];

  const RESIDUAL_EFFORT_PROMPTS = {
    system:
      "You are a senior engineering expert in migrating source code as well as reviewing source code.",
    userSummarize: `You are overseeing migration of a codebase.
You are evaluating the impact of changes made to the codebase to fix migration issues.
After fixing specific migration issues, the compilation/build and static analysis tools were re-run.
These tools have reported new issues — some may be compilation or build errors, while others may be new migration issues identified by the migration analyzer.
Your task is to determine what new issues were introduced, how severe they are, and how complex it would be to fix them.

You are given:
- The original migration issues being fixed.
- Various tools to access post migration artifacts such as compilation / build and static analysis tooling post migration, changed files, contents of pre and post migration files, among others.

## Your task

Evaluate the *impact* and *complexity* of newly introduced issues after applying the migration fix.

Follow a deterministic, evidence-based process as described below:

* Understand the new issues
- Collect all new issues reported after the fix — both from build/compilation logs and static analysis tools.
- Distinguish between:
  - Compilation / Build issues (syntax, missing symbols, type mismatches, dependency errors, etc.)
  - Migration issues (detected by static analysis tooling that verifies framework-specific rules or patterns).
- Group the new issues into distinct, logically separate issues. For instance, multiple issues may be fixed by a single fix. Or, more than one issues may be closely related to each other requiring interdependent fixes.
  - Multiple tool reports that stem from one root cause → treat as one issue.
  - Separate unrelated failures → treat as different issues.

* Evidence-driven only.
- For each distinct issue:
  - Inspect pre- and post-migration code to determine what caused it.
  - Identify:
    - Impacted functions, modules, or APIs
    - Root cause (e.g., missing import, incompatible API call, incorrect type adaptation)
    - Possible scope of fix (localized vs. cross-component)

* Compare precisely.
- Anchor every claim to evidence (specific functions, variables, or test traces).
- Avoid judgmental or speculative phrasing — report observations only.

* Do not overreach.
- Do not infer new requirements, "intended" fixes, or performance expectations.
- This is not a code-quality or completeness evaluation — only functional equivalence.

## Output requirements

- For each *logically distinct* issue, provide a work estimate for fixing the issue on a scale given below:
    - TRIVIAL_CHANGES_NEEDED: Requires only a few small, localized modifications to files in the codebase (e.g., renaming, updating a parameter, minor logic tweak, or adding a missing import).
    - COMPLEX_CHANGES_NEEDED: Requires multiple related changes across files, complex logic changes, or coordination between components or services.
    - REDESIGN_NEEDED: Indicates a fundamental design or architectural flaw requiring a significant refactor or reimplementation of core logic.

Produce your output in format below:

\`\`\`
---
<Issue title>

<Brief, objective reasoning for every distinct issue you found — reference specific files, functions, or behaviors as evidence.>

Rating: <TRIVIAL_CHANGES_NEEDED | COMPLEX_CHANGES_NEEDED | REDESIGN_NEEDED>
---
<Issue 2 title>

<Brief, objective reasoning for every distinct issue you found — reference specific files, functions, or behaviors as evidence.>

Rating: <TRIVIAL_CHANGES_NEEDED | COMPLEX_CHANGES_NEEDED | REDESIGN_NEEDED>
---
...and so on.
\`\`\`

If no new issues are introduced, respond with:

\`\`\`
NO_ISSUES_INTRODUCED
\`\`\`

Here are your inputs:

## Original migration issues
${issues}

## Migration context:
${testCase.migrationHint}`,
  };

  try {
    const agent = createReactAgent({
      llm: model,
      tools: [
        evaluationTools.getAppArchitectureTool(),
        evaluationTools.getListChangedFilesTool(),
        evaluationTools.getFileContentTool(),
        evaluationTools.getListFilesTool(),
        evaluationTools.getAnalysisTasksDiffTool(),
        evaluationTools.getDiagnosticsTasksDiffTool(),
      ],
      messageModifier: RESIDUAL_EFFORT_PROMPTS.system,
    });

    const response = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content: RESIDUAL_EFFORT_PROMPTS.userSummarize,
          },
        ],
      },
      {
        recursionLimit: 50,
      },
    );

    responses.push(...response.messages);
    const content = response.messages[response.messages.length - 1].content;

    // Calculate score based on issues found
    if (content.toString().includes("NO_ISSUES_INTRODUCED")) {
      return {
        metric: {
          reasoning: content.toString(),
          score: 1.0,
        },
        responses,
      };
    }

    let score = 1.0;
    const METRICS = {
      TRIVIAL_CHANGES_NEEDED: 0.05,
      COMPLEX_CHANGES_NEEDED: 0.2,
      REDESIGN_NEEDED: 0.7,
    };

    const lines = content.toString().split("\n");
    for (const line of lines) {
      const match = line.match(/Rating:\s*([^\n\r*#]+)/);
      if (match) {
        const rating = match[1].trim();
        const deduction = METRICS[rating as keyof typeof METRICS] || 0;
        score -= deduction;
      }
    }

    return {
      metric: {
        reasoning: content.toString(),
        score: Math.max(score, 0), // Ensure non-negative
      },
      responses,
    };
  } catch (error) {
    logger.error("Error in residual effort agent", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Runs all three evaluation agents in parallel
 */
export async function runEvaluation(input: AgentInput): Promise<{
  completeness: AgentResult;
  functionalParity: AgentResult;
  residualEffort: AgentResult;
}> {
  const results = await Promise.allSettled([
    runCompletenessAgent(input),
    runFunctionalParityAgent(input),
    runResidualEffortAgent(input),
  ]);

  const [completenessResult, functionalParityResult, residualEffortResult] =
    results;

  if (completenessResult.status === "rejected") {
    throw new Error(`Completeness agent failed: ${completenessResult.reason}`);
  }
  if (functionalParityResult.status === "rejected") {
    throw new Error(
      `Functional parity agent failed: ${functionalParityResult.reason}`,
    );
  }
  if (residualEffortResult.status === "rejected") {
    throw new Error(
      `Residual effort agent failed: ${residualEffortResult.reason}`,
    );
  }

  return {
    completeness: completenessResult.value,
    functionalParity: functionalParityResult.value,
    residualEffort: residualEffortResult.value,
  };
}
