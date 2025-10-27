import { promises as fs } from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { Logger } from "winston";

import { setupProviders, TaskProviderSetupConfig } from "../src/setup/providers";
import { createOrderedLogger } from "../src/utils/logger";
import { getConfig } from "../src/utils/config";

describe("AnalysisTasksProvider E2E Tests", () => {
  let logger: Logger;
  let coolstoreProjectPath: string;
  let testDataPath: string;
  let providersSetup: Awaited<ReturnType<typeof setupProviders>>;

  beforeAll(async () => {
    const { config, env } = await getConfig({
      workingDir: path.resolve(__dirname, ".."),
    });
    testDataPath = path.resolve(__dirname, "test-data");

    const logDir = path.join(testDataPath, "logs");

    logger = createOrderedLogger(
      config.logLevel?.console || "error",
      config.logLevel?.file || "silly",
      path.join(logDir, "analysis-tasks-test.log")
    );

    coolstoreProjectPath = path.join(testDataPath, "coolstore");

    try {
      await fs.rm(coolstoreProjectPath, { recursive: true, force: true });
    } catch (error) {
      // Directory doesn't exist
    }

    logger.info("Cloning coolstore repository...");
    try {
      execSync(
        `git clone https://github.com/konveyor-ecosystem/coolstore.git ${coolstoreProjectPath}`,
        { stdio: "pipe", timeout: 60000 }
      );
    } catch (error) {
      throw new Error(`Failed to clone coolstore repository: ${error}`);
    }

    const pomPath = path.join(coolstoreProjectPath, "pom.xml");
    await fs.access(pomPath);

    const providerConfig: TaskProviderSetupConfig = {
      workspacePaths: [coolstoreProjectPath],
      logger,
      ...(config.jdtlsBinaryPath && {
        diagnosticsParams: {
          jdtlsBinaryPath: config.jdtlsBinaryPath,
          jdtlsBundles: config.jdtlsBundles || [],
          jvmMaxMem: config.jvmMaxMem,
          logDir,
        },
      }),
      ...(config.kaiAnalyzerRpcPath && {
        analysisParams: {
          analyzerBinaryPath: config.kaiAnalyzerRpcPath,
          rulesPaths: config.rulesPaths || [],
          targets: ["quarkus", "jakarta-ee", "cloud-readiness"],
          sources: [],
          logDir,
        },
      }),
    };

    if (!config.jdtlsBinaryPath) {
      throw new Error("JDTLS binary path not configured in .config.json");
    }

    if (!config.kaiAnalyzerRpcPath) {
      throw new Error("Kai analyzer RPC path not configured in .config.json");
    }

    providersSetup = await setupProviders(providerConfig);
    logger.info("Providers setup completed", {
      providerCount: Object.keys(providersSetup.providers).length
    });
  }, 120000);

  afterAll(async () => {
    if (providersSetup) {
      try {
        await providersSetup.shutdown();
        logger.info("Providers shutdown completed");
      } catch (error) {
        logger.error("Error during providers shutdown", { error });
      }
    }

    if (process.env.NODE_ENV !== "test-failed") {
      try {
        await fs.rm(coolstoreProjectPath, { recursive: true, force: true });
      } catch (error) {
        logger.warn("Failed to clean up coolstore directory", { error });
      }
    }
  });

  // this test performs 3 analyses:
  // 1. initial analysis
  // 2. partial analysis triggered by file update
  // 3. partial analysis triggered by file update (reset to original content)
  it("should get tasks from analysis provider under different conditions", async () => {
    // ensure providers inited
    expect(providersSetup).toBeDefined();
    expect(providersSetup.providers).toBeDefined();
    const totalInited = Object.values(providersSetup.providers).filter(p => p?.isInitialized()).length
    expect(totalInited).toBe(2);
    logger.info("Both providers initialized successfully");
    
    // test whether initial analysis is triggered
    const analysisProvider = providersSetup.providers.analysis;
    if (!analysisProvider || !analysisProvider.isInitialized()) {
      throw new Error("Analysis provider not initialized");
    }
    const initialAnalysisTasks = await analysisProvider.getCurrentTasks();
    expect(Array.isArray(initialAnalysisTasks)).toBe(true);
    expect(initialAnalysisTasks.length).toBeGreaterThan(150);
    logger.info("Analysis tasks retrieved", {
      taskCount: initialAnalysisTasks.length
    });
    
    // test whether a file update triggers partial analysis
    // update 1: update beans.xml (builtin)
    const beansXmlPath = path.join(coolstoreProjectPath, 
      "src", "main", "webapp", "WEB-INF", "beans.xml");
    const beansXmlOriginal = await fs.readFile(beansXmlPath, "utf-8");
    expect(initialAnalysisTasks.some(task => task.getUri() === beansXmlPath)).toBe(true);
    const incidentsInBeansXmlBefore = initialAnalysisTasks.filter(task => task.getUri() === beansXmlPath);
    const beansXmlUpdate = `<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://xmlns.jcp.org/xml/ns/jakartaee" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	   xsi:schemaLocation="
      http://xmlns.jcp.org/xml/ns/jakartaee
      http://xmlns.jcp.org/xml/ns/jakartaee/beans_1_1.xsd"
	   bean-discovery-mode="all">
</beans>
`
    // update 2: update CatalogService.java (java)
    const catalogServiceJavaPath = path.join(coolstoreProjectPath, 
      "src", "main", "java", "com", "redhat", "coolstore", "service", "CatalogService.java");
    expect(initialAnalysisTasks.some(task => task.getUri() === catalogServiceJavaPath)).toBe(true);
    const incidentsInCatalogServiceJavaBefore = initialAnalysisTasks.filter(task => task.getUri() === catalogServiceJavaPath && task.toString().includes("The package 'javax' has been replaced by 'jakarta'"));
    const catalogServiceJavaOriginal = await fs.readFile(catalogServiceJavaPath, "utf-8");
    const catalogServiceJavaUpdate = catalogServiceJavaOriginal.replace(
      /import javax\.(.*);/g,
      "import jakarta.$1;"
    );
    await fs.writeFile(catalogServiceJavaPath, catalogServiceJavaUpdate, "utf-8");
    await fs.writeFile(beansXmlPath, beansXmlUpdate, "utf-8");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newAnalysisTasks = await analysisProvider.getCurrentTasks();
    const incidentsInBeansXmlAfter = newAnalysisTasks.filter(task => task.getUri() === beansXmlPath);
    expect(incidentsInBeansXmlAfter.length).toBeLessThan(incidentsInBeansXmlBefore.length);
    const incidentsInCatalogServiceJavaAfter = newAnalysisTasks.filter(task => task.getUri() === catalogServiceJavaPath && task.toString().includes("The package 'javax' has been replaced by 'jakarta'"));
    expect(incidentsInCatalogServiceJavaAfter.length).toBeLessThan(incidentsInCatalogServiceJavaBefore.length);
    logger.info("Partial analysis triggered", {
      incidentsInBeansXmlBefore: incidentsInBeansXmlBefore.length,
      incidentsInBeansXmlAfter: incidentsInBeansXmlAfter.length,
      incidentsInCatalogServiceJavaBefore: incidentsInCatalogServiceJavaBefore.length,
      incidentsInCatalogServiceJavaAfter: incidentsInCatalogServiceJavaAfter.length
    });
    
    // reset file content to original and expect original incidents
    await fs.writeFile(beansXmlPath, beansXmlOriginal, "utf-8");
    await fs.writeFile(catalogServiceJavaPath, catalogServiceJavaOriginal, "utf-8");
    await new Promise(resolve => setTimeout(resolve, 2000));
    const analysisTasksAfterReset = await analysisProvider.getCurrentTasks();
    const incidentsInBeansXmlAfterReset = analysisTasksAfterReset.filter(task => task.getUri() === beansXmlPath);
    expect(incidentsInBeansXmlAfterReset.length).toBe(incidentsInBeansXmlBefore.length);
    const incidentsInCatalogServiceJavaAfterReset = analysisTasksAfterReset.filter(task => task.getUri() === catalogServiceJavaPath && task.toString().includes("The package 'javax' has been replaced by 'jakarta'"));
    expect(incidentsInCatalogServiceJavaAfterReset.length).toBe(incidentsInCatalogServiceJavaBefore.length);
  }, 600000); // this shouldn't take over 5 minutes
});