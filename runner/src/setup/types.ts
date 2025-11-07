// Input to run a Kai workflow for fix generation
// Today we fix by incidents, in future, we may pass plan
export type RunKaiWorkflowInput = {
  kind: "fixByRules";
  data: {
    rules: {
      ruleset: string;
      rule: string;
    }[];
    migrationHint: string;
    programmingLanguage: string;
    agentMode: boolean;
  };
};
