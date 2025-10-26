export interface AnalysisIncident {
  uri: string;
  message: string;
  description?: string;
  lineNumber?: number;
  column?: number;
  ruleSet?: string;
  rule?: string;
  category?: string;
  effort?: number;
  links?: string[];
}

export interface AnalysisViolation {
  description: string;
  category?: string;
  labels?: string[];
  incidents?: AnalysisIncident[];
}

export interface AnalysisRuleSet {
  name: string;
  description?: string;
  violations?: Record<string, AnalysisViolation>;
}

export interface TriggerAnalysisEvent {
  includedPaths: string[];
  excludedPaths: string[];
  resetCache: boolean;
  timestamp: Date;
}
