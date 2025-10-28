import { join } from "path";

import { createOrderedLogger } from "../src/utils/logger";
import { parseTestCasesFromDirectory } from "../src/eval/parser";

const evalDataDir = join(__dirname, "test-data", "evalData");
const logger = createOrderedLogger("info");

describe("Evaluation Component and Integration Tests", () => {
  it("should parse test cases from evalData directory", async () => {
    try {
      const testCases = await parseTestCasesFromDirectory(evalDataDir);

      logger.info(`Successfully parsed ${testCases.length} test cases`);

      if (testCases.length > 0) {
        logger.log("First test case:", JSON.stringify(testCases[0], null, 2));
      }

      expect(testCases).toBeDefined();
      expect(Array.isArray(testCases)).toBe(true);
    } catch (error) {
      logger.error(
        `Failed to parse test cases: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  }, 10000);
});
