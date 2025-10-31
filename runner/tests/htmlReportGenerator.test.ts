import { promises as fs } from "fs";
import * as path from "path";
import { generateHtmlReport } from "../src/utils/htmlReportGenerator";

describe("HTML Report Generator", () => {
  const reportJsonPath = path.join(__dirname, "test-data", "eval_results.json");
  const testOutputPath = path.join(
    __dirname,
    "test-data",
    "logs",
    "test_report.html",
  );

  afterEach(async () => {
    // Clean up generated test file
    try {
      // await fs.unlink(testOutputPath);
    } catch (error) {
      // File might not exist, that's okay
    }
  });

  test("should generate HTML report from eval_results.json", async () => {
    let jsonData;
    try {
      const jsonContent = await fs.readFile(reportJsonPath, "utf-8");
      jsonData = JSON.parse(jsonContent);
    } catch (error) {
      console.log("No eval_results.json found, creating mock data for testing");
      // Create mock data if eval_results.json doesn't exist
      jsonData = createMockEvaluationData();
    }

    // Generate HTML report
    await generateHtmlReport(jsonData, testOutputPath);

    // Verify file was created
    const htmlContent = await fs.readFile(testOutputPath, "utf-8");

    // Basic content checks
    expect(htmlContent).toContain("<!DOCTYPE html>");
    expect(htmlContent).toContain("Kai Evaluation Report");
    expect(htmlContent).toContain("chart.js");
    expect(htmlContent).toContain("Completeness");
    expect(htmlContent).toContain("Functional Parity");
    expect(htmlContent).toContain("Residual Effort");
    expect(htmlContent).toContain("Weighted Average");

    // Check if summary data is included
    expect(htmlContent).toContain(jsonData.summary.totalTestCases.toString());
    expect(htmlContent).toContain(jsonData.summary.totalExperiments.toString());

    // Check if application names are included
    for (const result of jsonData.results) {
      expect(htmlContent).toContain(result.testCase.application.name);
      expect(htmlContent).toContain(result.testCase.name);
    }

    console.log(`✅ HTML report generated successfully at: ${testOutputPath}`);
    console.log(
      "You can open it in your browser to view the interactive charts!",
    );
  });
});

function createMockEvaluationData() {
  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalTestCases: 1,
      totalExperiments: 2,
      totalErrors: 0,
    },
    results: [
      {
        testCase: {
          name: "jms-to-smallrye",
          description: "Mock test case for JMS to SmallRye migration",
          rules: [
            {
              ruleset: "quarkus/springboot",
              rule: "jms-to-reactive-quarkus-00050",
            },
          ],
          application: {
            name: "coolstore",
            programmingLanguage: "java",
          },
        },
        experiments: [
          {
            variant: "basic",
            model: "ChatOpenAI/gpt-4o",
            metrics: {
              completeness: {
                score: 0.8,
                reasoning: "Mock completeness reasoning",
              },
              functionalParity: {
                score: 1.0,
                reasoning: "Mock functional parity reasoning",
              },
              residualEffort: {
                score: 0.9,
                reasoning: "Mock residual effort reasoning",
              },
            },
            diff: "src/main/java/com/example/Service.java",
          },
          {
            variant: "agent",
            model: "ChatBedrock/claude-3-sonnet",
            metrics: {
              completeness: {
                score: 0.9,
                reasoning: "Mock completeness reasoning for agent mode",
              },
              functionalParity: {
                score: 1.0,
                reasoning: "Mock functional parity reasoning for agent mode",
              },
              residualEffort: {
                score: 1.0,
                reasoning: "Mock residual effort reasoning for agent mode",
              },
            },
            diff: "src/main/java/com/example/Service.java\npom.xml",
          },
        ],
        errors: [],
      },
    ],
  };
}

function createMockMultiAppData() {
  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalTestCases: 2,
      totalExperiments: 8,
      totalErrors: 0,
    },
    results: [
      {
        testCase: {
          name: "jms-to-smallrye",
          description: "JMS to SmallRye migration",
          rules: [{ ruleset: "quarkus", rule: "jms-migration" }],
          application: { name: "coolstore", programmingLanguage: "java" },
        },
        experiments: [
          {
            variant: "basic",
            model: "ChatOpenAI/gpt-4o",
            metrics: {
              completeness: { score: 0.8, reasoning: "Good progress" },
              functionalParity: { score: 1.0, reasoning: "Equivalent" },
              residualEffort: { score: 0.9, reasoning: "Minor issues" },
            },
            diff: "Service.java",
          },
          {
            variant: "basic",
            model: "ChatBedrock/claude-3-sonnet",
            metrics: {
              completeness: { score: 0.85, reasoning: "Better progress" },
              functionalParity: { score: 1.0, reasoning: "Equivalent" },
              residualEffort: { score: 0.95, reasoning: "Very minor issues" },
            },
            diff: "Service.java",
          },
          {
            variant: "agent",
            model: "ChatOpenAI/gpt-4o",
            metrics: {
              completeness: { score: 0.9, reasoning: "Excellent with agent" },
              functionalParity: { score: 1.0, reasoning: "Equivalent" },
              residualEffort: { score: 1.0, reasoning: "No issues" },
            },
            diff: "Service.java\npom.xml",
          },
          {
            variant: "agent",
            model: "ChatBedrock/claude-3-sonnet",
            metrics: {
              completeness: { score: 0.95, reasoning: "Near perfect" },
              functionalParity: { score: 1.0, reasoning: "Equivalent" },
              residualEffort: { score: 1.0, reasoning: "No issues" },
            },
            diff: "Service.java\npom.xml",
          },
        ],
        errors: [],
      },
      {
        testCase: {
          name: "ejb-to-cdi",
          description: "EJB to CDI migration",
          rules: [{ ruleset: "quarkus", rule: "ejb-migration" }],
          application: { name: "petclinic", programmingLanguage: "java" },
        },
        experiments: [
          {
            variant: "basic",
            model: "ChatOpenAI/gpt-4o",
            metrics: {
              completeness: { score: 0.7, reasoning: "Partial progress" },
              functionalParity: { score: 0.9, reasoning: "Mostly equivalent" },
              residualEffort: { score: 0.8, reasoning: "Some issues" },
            },
            diff: "Controller.java",
          },
          {
            variant: "basic",
            model: "ChatBedrock/claude-3-sonnet",
            metrics: {
              completeness: { score: 0.75, reasoning: "Better progress" },
              functionalParity: { score: 0.95, reasoning: "Nearly equivalent" },
              residualEffort: { score: 0.85, reasoning: "Minor issues" },
            },
            diff: "Controller.java",
          },
          {
            variant: "agent",
            model: "ChatOpenAI/gpt-4o",
            metrics: {
              completeness: { score: 0.85, reasoning: "Good with agent" },
              functionalParity: { score: 1.0, reasoning: "Equivalent" },
              residualEffort: { score: 0.9, reasoning: "Very minor issues" },
            },
            diff: "Controller.java\nService.java",
          },
          {
            variant: "agent",
            model: "ChatBedrock/claude-3-sonnet",
            metrics: {
              completeness: { score: 0.9, reasoning: "Excellent with agent" },
              functionalParity: { score: 1.0, reasoning: "Equivalent" },
              residualEffort: { score: 0.95, reasoning: "Minimal issues" },
            },
            diff: "Controller.java\nService.java",
          },
        ],
        errors: [],
      },
    ],
  };
}
