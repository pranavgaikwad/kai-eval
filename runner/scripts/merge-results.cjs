#!/usr/bin/env node

/**
 * Script to merge multiple Kai evaluation JSON result files
 *
 * Usage: node merge-results.cjs <directory_path>
 *
 * Merges all results.json files found recursively in the given directory
 * according to the following rules:
 * 1. timestamp field should be the latest timestamp among all files
 * 2. summary should be calculated correctly based on the final merged numbers
 * 3. results should be merged where experiments of two test cases by the same name
 *    and for the same app are merged and for the same variant/model any of the
 *    two experiment results are retained
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

  // Load all JSON files
  for (const filePath of jsonFiles) {
    console.log(`Loading: ${filePath}`);
    const data = loadJsonFile(filePath);
    if (data) {
      allData.push(data);

      // Track latest timestamp
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

  // Merge results by test case key
  const mergedResultsMap = new Map();

  for (const data of allData) {
    if (!data.results || !Array.isArray(data.results)) {
      console.warn("Invalid results structure in JSON file");
      continue;
    }

    for (const result of data.results) {
      const testCaseKey = getTestCaseKey(result.testCase);

      if (!mergedResultsMap.has(testCaseKey)) {
        // First time seeing this test case, initialize with a copy
        mergedResultsMap.set(testCaseKey, {
          testCase: { ...result.testCase },
          experiments: [],
          errors: [...(result.errors || [])],
        });
      }

      const mergedResult = mergedResultsMap.get(testCaseKey);

      // Merge experiments by variant:model key
      const experimentMap = new Map();

      // Add existing experiments to map
      for (const exp of mergedResult.experiments) {
        const expKey = getExperimentKey(exp);
        experimentMap.set(expKey, exp);
      }

      // Add new experiments (will overwrite duplicates)
      for (const exp of result.experiments || []) {
        const expKey = getExperimentKey(exp);
        experimentMap.set(expKey, { ...exp });
      }

      // Update the experiments array
      mergedResult.experiments = Array.from(experimentMap.values());

      // Merge errors (avoid duplicates)
      const errorSet = new Set(mergedResult.errors);
      for (const error of result.errors || []) {
        errorSet.add(error);
      }
      mergedResult.errors = Array.from(errorSet);
    }
  }

  // Convert map back to array
  const mergedResults = Array.from(mergedResultsMap.values());

  // Calculate summary
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

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error("Usage: node merge-results.cjs <directory_path>");
    console.error("");
    console.error(
      "This script finds all results.json files recursively in the given directory",
    );
    console.error("and merges them into a single JSON file");
    process.exit(1);
  }

  const directoryPath = args[0];

  if (!fs.existsSync(directoryPath)) {
    console.error(`Error: Directory '${directoryPath}' does not exist`);
    process.exit(1);
  }

  if (!fs.statSync(directoryPath).isDirectory()) {
    console.error(`Error: '${directoryPath}' is not a directory`);
    process.exit(1);
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

  // Write merged results to stdout
  console.log("\n--- MERGED RESULTS ---");
  console.log(
    fs.writeFileSync(
      "merged-results.json",
      JSON.stringify(mergedData, null, 2),
    ),
  );
  console.log(`Merged results written to: merged-results.json`);
  process.exit(0);
}

if (require.main === module) {
  main();
}
