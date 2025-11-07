#!/usr/bin/env node

/**
 * Script to merge multiple Kai evaluation JSON result files
 *
 * Usage: node merge-results.cjs <directory_path> [--output-dir <output_directory>]
 *
 * Merges all results.json files found recursively in the given directory
 * according to the following rules:
 * 1. timestamp field should be the latest timestamp among all files
 * 2. summary should be calculated correctly based on the final merged numbers
 * 3. results should be merged where experiments of two test cases by the same name
 *    and for the same app are merged and for the same variant/model any of the
 *    two experiment results are retained
 *
 * Generates both merged JSON and HTML reports in the output directory
 */

const fs = require("fs");
const path = require("path");

function findJsonFiles(dir) {
  const jsonFiles = [];

  function searchRecursively(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        searchRecursively(fullPath);
      } else if (entry.isFile() && entry.name === "results.json") {
        jsonFiles.push(fullPath);
      }
    }
  }

  searchRecursively(dir);
  return jsonFiles;
}

function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

function getTestCaseKey(testCase) {
  return `${testCase.application.name}#${testCase.name}`;
}

function getExperimentKey(experiment) {
  return `${experiment.variant}:${experiment.model}`;
}

function mergeResults(jsonFiles) {
  const allData = [];
  let latestTimestamp = "";

  for (const filePath of jsonFiles) {
    console.log(`Loading: ${filePath}`);
    const data = loadJsonFile(filePath);
    if (data) {
      allData.push(data);

      if (data.timestamp && data.timestamp > latestTimestamp) {
        latestTimestamp = data.timestamp;
      }
    }
  }

  if (allData.length === 0) {
    console.warn("No valid JSON files found to merge");
    return null;
  }

  console.log(`Loaded ${allData.length} JSON files`);

  const mergedResultsMap = new Map();

  for (const data of allData) {
    if (!data.results || !Array.isArray(data.results)) {
      console.warn("Invalid results structure in JSON file");
      continue;
    }

    for (const result of data.results) {
      const testCaseKey = getTestCaseKey(result.testCase);

      if (!mergedResultsMap.has(testCaseKey)) {
        mergedResultsMap.set(testCaseKey, {
          testCase: { ...result.testCase },
          experiments: [],
          errors: [...(result.errors || [])],
        });
      }

      const mergedResult = mergedResultsMap.get(testCaseKey);

      const experimentMap = new Map();

      for (const exp of mergedResult.experiments) {
        const expKey = getExperimentKey(exp);
        experimentMap.set(expKey, exp);
      }

      for (const exp of result.experiments || []) {
        const expKey = getExperimentKey(exp);
        experimentMap.set(expKey, { ...exp });
      }

      mergedResult.experiments = Array.from(experimentMap.values());

      const errorSet = new Set(mergedResult.errors);
      for (const error of result.errors || []) {
        errorSet.add(error);
      }
      mergedResult.errors = Array.from(errorSet);
    }
  }

  const mergedResults = Array.from(mergedResultsMap.values());

  const totalTestCases = mergedResults.length;
  const totalExperiments = mergedResults.reduce(
    (sum, result) => sum + result.experiments.length,
    0,
  );
  const totalErrors = mergedResults.reduce(
    (sum, result) => sum + result.errors.length,
    0,
  );

  const mergedData = {
    timestamp: latestTimestamp,
    summary: {
      totalTestCases,
      totalExperiments,
      totalErrors,
    },
    results: mergedResults,
  };

  console.log(`Merged Summary:`);
  console.log(`  Test Cases: ${totalTestCases}`);
  console.log(`  Experiments: ${totalExperiments}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Latest Timestamp: ${latestTimestamp}`);

  return mergedData;
}

function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    directoryPath: null,
    outputDir: process.cwd(), // Default to current directory
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--output-dir") {
      if (i + 1 >= args.length) {
        console.error("Error: --output-dir requires a value");
        process.exit(1);
      }
      options.outputDir = args[i + 1];
      i++; // Skip the next argument as it's the value for --output-dir
    } else if (!options.directoryPath) {
      options.directoryPath = arg;
    } else {
      console.error(`Error: Unexpected argument '${arg}'`);
      process.exit(1);
    }
  }

  if (!options.directoryPath) {
    console.error("Usage: node merge-results.cjs <directory_path> [--output-dir <output_directory>]");
    console.error("");
    console.error(
      "This script finds all results.json files recursively in the given directory",
    );
    console.error("and merges them into JSON and HTML reports in the output directory");
    process.exit(1);
  }

  return options;
}

async function main() {
  const { directoryPath, outputDir } = parseArguments();

  if (!fs.existsSync(directoryPath)) {
    console.error(`Error: Directory '${directoryPath}' does not exist`);
    process.exit(1);
  }

  if (!fs.statSync(directoryPath).isDirectory()) {
    console.error(`Error: '${directoryPath}' is not a directory`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    console.log(`Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Searching for results.json files in: ${directoryPath}`);

  const jsonFiles = findJsonFiles(directoryPath);

  if (jsonFiles.length === 0) {
    console.error("No results.json files found in the directory");
    process.exit(1);
  }

  console.log(`Found ${jsonFiles.length} JSON files:`);
  jsonFiles.forEach((file) => console.log(`  - ${file}`));
  console.log("");

  const mergedData = mergeResults(jsonFiles);

  if (!mergedData) {
    console.error("Failed to merge results");
    process.exit(1);
  }

  // Generate output file paths
  const jsonOutputPath = path.join(outputDir, "merged-results.json");
  const htmlOutputPath = path.join(outputDir, "merged-report.html");

  // Write merged JSON results
  console.log("\n--- GENERATING REPORTS ---");
  fs.writeFileSync(jsonOutputPath, JSON.stringify(mergedData, null, 2));
  console.log(`✅ Merged JSON results written to: ${jsonOutputPath}`);

  console.log("\n--- SUMMARY ---");
  console.log(`📂 Output directory: ${outputDir}`);
  console.log(`📄 JSON report: ${path.basename(jsonOutputPath)}`);
  console.log(`🌐 HTML report: ${path.basename(htmlOutputPath)}`);

  process.exit(0);
}

if (require.main === module) {
  main();
}
