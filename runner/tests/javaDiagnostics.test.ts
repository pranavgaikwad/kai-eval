import {
  JavaDiagnosticsTasksProvider,
  JavaDiagnosticsInitParams,
} from "../src/taskProviders/javaDiagnosticsTasksProvider";
import path from "path";
import { Logger } from "winston";
import { createOrderedLogger } from "../src/utils/logger";
import { getConfig } from "../src/utils/config";

describe("JavaDiagnosticsTasksProvider Integration Tests", () => {
  let provider: JavaDiagnosticsTasksProvider;
  let logger: Logger;

  beforeEach(async () => {
    // Load configuration from files
    const { config, env } = await getConfig({
      workingDir: path.resolve(__dirname, ".."),
    });

    const testDataPath = path.resolve(__dirname, "test-data");
    const logDir = path.join(
      testDataPath,
      "logs",
      `java-diagnostics-test-${new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z")}`,
    );
    logger = createOrderedLogger(
      config.logLevel?.console || "error",
      config.logLevel?.file || "silly",
      path.join(logDir, "java-diagnostics-test.log"),
    );
    provider = new JavaDiagnosticsTasksProvider(logger);

    const jdtBinaryPath = config.jdtlsBinaryPath || env.JDTLS_BINARY_PATH || "";
    const testJavaProjectPath = path.join(testDataPath, "java");
    const workspacePaths = [testJavaProjectPath];
    const bundles = config.jdtlsBundles || env.JDTLS_BUNDLES?.split(",") || [];
    const jvmMaxMem = config.jvmMaxMem || env.JVM_MAX_MEM;

    const initParams: JavaDiagnosticsInitParams = {
      jdtlsBinaryPath: jdtBinaryPath,
      workspacePaths,
      jdtlsBundles: bundles,
      jvmMaxMem,
      logDir,
    };

    await provider.init(initParams);
  }, 30000);

  afterEach(async () => {
    if (provider && provider.isInitialized()) {
      await provider.stop();
    }
  });

  it("should initialize diagnostics provider and publish diagnostics", async () => {
    expect(provider.isInitialized()).toBe(true);

    logger.debug("Waiting for JDTLS to process workspace");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const { tasks } = await provider.getCurrentTasks();
    logger.debug("Retrieved diagnostic tasks", { taskCount: tasks.length });

    expect(tasks.length).toBeGreaterThan(0);

    const testJavaProjectPath = path.resolve(__dirname, "test-data/java");
    const mainJavaPath = path.join(
      testJavaProjectPath,
      "src/main/java/com/example/Main.java",
    );
    const diagnosticsForMainJava = tasks.filter((task) => {
      const taskJson = task.toJSON();
      return taskJson.file === mainJavaPath;
    });

    expect(diagnosticsForMainJava.length).toBeGreaterThanOrEqual(2);

    const intentionalErrors = diagnosticsForMainJava.filter((task) => {
      const taskJson = task.toJSON();
      return (
        taskJson.description &&
        typeof taskJson.description === "string" &&
        taskJson.description.includes(
          "com.intentional cannot be resolved to a type",
        ) &&
        taskJson.line === 7 &&
        taskJson.type === "error"
      );
    });

    expect(intentionalErrors.length).toBe(2);

    const firstError = intentionalErrors.filter((task) => {
      const taskJson = task.toJSON();
      return (
        taskJson.column === 9 &&
        taskJson.type === "error" &&
        taskJson.source === "Java"
      );
    });
    const secondError = intentionalErrors.filter((task) => {
      const taskJson = task.toJSON();
      return (
        taskJson.column === 47 &&
        taskJson.type === "error" &&
        taskJson.source === "Java"
      );
    });

    expect(firstError).toBeDefined();
    expect(secondError).toBeDefined();
    expect(firstError.length).toBe(1);
    expect(secondError.length).toBe(1);
  }, 15000);

  it("should handle file change events", async () => {
    expect(provider.isInitialized()).toBe(true);

    const testJavaProjectPath = path.resolve(__dirname, "test-data/java");
    const mainJavaFilePath = path.join(
      testJavaProjectPath,
      "src/main/java/com/example/Main.java",
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const { tasks: initialTasks } = await provider.getCurrentTasks();

    const initialErrors = initialTasks.filter((task) => {
      const taskJson = task.toJSON();
      return (
        taskJson.file === mainJavaFilePath &&
        taskJson.description &&
        typeof taskJson.description === "string" &&
        taskJson.description.includes(
          "com.intentional cannot be resolved to a type",
        ) &&
        taskJson.line === 7
      );
    });
    expect(initialErrors.length).toBe(2);

    const fs = await import("fs");
    const originalContent = await fs.promises.readFile(
      mainJavaFilePath,
      "utf-8",
    );

    try {
      // comment out the intentional error
      const lines = originalContent.split("\n");
      lines[6] = "        // " + lines[6];
      const modifiedContent = lines.join("\n");

      await fs.promises.writeFile(mainJavaFilePath, modifiedContent, "utf-8");

      const fileChangeEvent = {
        path: mainJavaFilePath,
        type: "modified" as const,
        timestamp: new Date(),
      };
      await provider.onFileChange?.(fileChangeEvent);
      logger.debug("File change event processed");

      // Wait longer for JDTLS to detect file change and reprocess
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force debouncer to process any pending events
      await provider.getCurrentTasks();

      // Wait a bit more for diagnostics to be updated
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const { tasks: updatedTasks } = await provider.getCurrentTasks();

      const remainingErrors = updatedTasks.filter((task) => {
        const taskJson = task.toJSON();
        return (
          taskJson.file === mainJavaFilePath &&
          taskJson.description &&
          typeof taskJson.description === "string" &&
          taskJson.description.includes(
            "com.intentional cannot be resolved to a type",
          ) &&
          taskJson.line === 7
        );
      });

      expect(remainingErrors.length).toBe(0);

      await fs.promises.writeFile(mainJavaFilePath, originalContent, "utf-8");
      await provider.onFileChange?.({
        path: mainJavaFilePath,
        type: "modified",
        timestamp: new Date(),
      });
      logger.debug("File change event processed");
      const { tasks: updatedTasksAgain } = await provider.getCurrentTasks();
      const remainingErrorsAgain = updatedTasksAgain.filter((task) => {
        const taskJson = task.toJSON();
        return (
          taskJson.file === mainJavaFilePath &&
          taskJson.description &&
          typeof taskJson.description === "string" &&
          taskJson.description.includes(
            "com.intentional cannot be resolved to a type",
          ) &&
          taskJson.line === 7
        );
      });

      expect(remainingErrorsAgain.length).toBe(2);

      logger.debug(
        "Verified diagnostics cleared after commenting out intentional error",
      );
    } finally {
      await fs.promises.writeFile(mainJavaFilePath, originalContent, "utf-8");
    }
  }, 30000);
});
