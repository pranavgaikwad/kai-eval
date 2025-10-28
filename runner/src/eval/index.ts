/**
 * Evaluation module for kai-eval runner
 *
 * This module provides types and utilities for running evaluations
 * on migration fixes using LLM-as-a-Judge methodology.
 */

export * from "./types";
export * from "./parser";

export const DEFAULT_EVALUATION_WEIGHTS = {
  completeness: 0.5,
  functionalParity: 0.3,
  residualEffort: 0.2,
} as const;

export function calculateFinalScore(
  completeness: number,
  functionalParity: number,
  residualEffort: number,
  weights = DEFAULT_EVALUATION_WEIGHTS,
): number {
  const scale = 10.0;
  return (
    scale *
    (weights.completeness * completeness +
      weights.functionalParity * functionalParity +
      weights.residualEffort * residualEffort)
  );
}
