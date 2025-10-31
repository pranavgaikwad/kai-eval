import { promises as fs } from "fs";

// Define the types based on the JSON structure from main.ts
export interface EvaluationResults {
  readonly timestamp: string;
  readonly summary: {
    readonly totalTestCases: number;
    readonly totalExperiments: number;
    readonly totalErrors: number;
  };
  readonly results: ResultData[];
}

interface ResultData {
  readonly testCase: {
    readonly name: string;
    readonly description: string;
    readonly rules: Array<{
      readonly ruleset: string;
      readonly rule: string;
    }>;
    readonly application: {
      readonly name: string;
      readonly programmingLanguage: string;
    };
  };
  readonly experiments: ExperimentData[];
  readonly errors: string[];
}

interface ExperimentData {
  readonly variant: string;
  readonly model: string;
  readonly metrics: {
    readonly completeness: {
      readonly score: number;
      readonly reasoning: string;
    };
    readonly functionalParity: {
      readonly score: number;
      readonly reasoning: string;
    };
    readonly residualEffort: {
      readonly score: number;
      readonly reasoning: string;
    };
  };
  readonly diff: string;
  readonly error?: string;
}

interface ProcessedData {
  applications: Map<string, ApplicationData>;
  allVariants: Set<string>;
  allModels: Set<string>;
}

interface ApplicationData {
  readonly name: string;
  readonly testCases: Map<string, TestCaseData>;
}

interface TestCaseData {
  readonly name: string;
  readonly description: string;
  readonly experiments: ExperimentData[];
  readonly errors: string[];
}

// Process the raw data into grouped format
function processData(jsonData: EvaluationResults): ProcessedData {
  const applications = new Map<string, ApplicationData>();
  const allVariants = new Set<string>();
  const allModels = new Set<string>();

  for (const result of jsonData.results) {
    const appName = result.testCase.application.name;

    if (!applications.has(appName)) {
      applications.set(appName, {
        name: appName,
        testCases: new Map(),
      });
    }

    const app = applications.get(appName)!;
    const testCaseName = result.testCase.name;

    app.testCases.set(testCaseName, {
      name: testCaseName,
      description: result.testCase.description,
      experiments: result.experiments,
      errors: result.errors,
    });

    // Collect all variants and models
    for (const experiment of result.experiments) {
      allVariants.add(experiment.variant);
      allModels.add(experiment.model);
    }
  }

  return {
    applications,
    allVariants,
    allModels,
  };
}

// Generate the HTML content
export async function generateHtmlReport(
  jsonData: EvaluationResults,
  outputPath: string,
): Promise<void> {
  const processedData = processData(jsonData);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kai Evaluation Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/diff2html@3.4.47/bundles/js/diff2html.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked@9.1.2/marked.min.js"></script>
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/diff2html@3.4.47/bundles/css/diff2html.min.css" />
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 30px;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 20px;
        }

        .title {
            color: #2c3e50;
            margin: 0 0 10px 0;
            font-size: 2.5em;
            font-weight: 300;
        }

        .timestamp {
            color: #7f8c8d;
            font-size: 1.1em;
        }

        .collapsible {
            background-color: #3498db;
            color: white;
            cursor: pointer;
            padding: 15px;
            width: 100%;
            border: none;
            text-align: left;
            outline: none;
            font-size: 16px;
            font-weight: 500;
            border-radius: 5px;
            margin: 10px 0 5px 0;
            transition: background-color 0.3s;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .collapsible:hover {
            background-color: #2980b9;
        }

        .collapsible.active {
            background-color: #2980b9;
        }

        .collapsible::after {
            content: '+';
            font-size: 20px;
            font-weight: bold;
        }

        .collapsible.active::after {
            content: '−';
        }

        .content {
            padding: 0;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            background-color: #f8f9fa;
            border-radius: 0 0 5px 5px;
        }

        .content.active {
            padding: 20px;
            max-height: none;
        }

        .app-collapsible {
            background-color: #e74c3c;
        }

        .app-collapsible:hover {
            background-color: #c0392b;
        }

        .app-collapsible.active {
            background-color: #c0392b;
        }

        .testcase-collapsible {
            background-color: #f39c12;
            margin-left: 20px;
        }

        .testcase-collapsible:hover {
            background-color: #d68910;
        }

        .testcase-collapsible.active {
            background-color: #d68910;
        }

        .summary-section {
            margin-bottom: 40px;
            padding-bottom: 30px;
            border-bottom: 2px solid #e0e0e0;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }

        .summary-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .summary-value {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .summary-label {
            font-size: 1.1em;
            opacity: 0.9;
        }

        .charts-container {
            margin: 20px 0;
        }

        .charts-row {
            display: flex;
            gap: 20px;
            margin: 20px 0;
            flex-wrap: wrap;
        }

        .chart-section {
            flex: 1;
            min-width: 300px;
            background-color: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .chart-title {
            font-size: 1.2em;
            font-weight: 600;
            margin-bottom: 15px;
            color: #2c3e50;
            text-align: center;
        }

        .weighted-avg-section {
            flex: 2;
            height: 400px;
            display: flex;
            flex-direction: column;
        }

        .weighted-avg-section canvas {
            flex: 1;
            max-height: 300px !important;
            height: 300px !important;
        }

        .individual-scores-section {
            flex: 3;
            display: flex;
            flex-direction: column;
        }

        .variant-charts {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .variant-chart {
            flex: 1;
            min-width: 250px;
            background-color: #f8f9fa;
            border-radius: 5px;
            padding: 15px 15px 15px 20px; /* Extra left padding for tilted Y-axis labels */
            max-height: 280px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .variant-chart canvas {
            flex: 1;
            min-height: 120px;
            max-height: 200px !important;
        }

        .variant-title {
            font-size: 1em;
            font-weight: 500;
            margin-bottom: 10px;
            color: #34495e;
            text-align: center;
        }

        .diff-section {
            margin: 20px 0;
        }

        .diff-selector {
            margin: 10px 0;
        }

        .diff-selector select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            margin: 0 10px;
        }

        .reasoning-section {
            margin: 15px 0;
        }

        .reasoning-boxes {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .reasoning-box {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 5px;
            padding: 15px;
        }

        .reasoning-title {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 14px;
        }

        .reasoning-score {
            font-weight: 500;
            margin-bottom: 8px;
            font-size: 13px;
        }

        .reasoning-text {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 10px;
            font-size: 12px;
            line-height: 1.4;
            max-height: 200px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .diff-container {
            margin: 15px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
            overflow: hidden;
        }

        .description {
            background-color: #f8f9fa;
            padding: 15px;
            margin: 10px 0;
            border-left: 4px solid #3498db;
            border-radius: 4px;
        }

        .markdown-content {
            margin-top: 20px;
        }

        .markdown-rendered {
            margin-top: 10px;
            line-height: 1.6;
        }

        .markdown-rendered h1, .markdown-rendered h2, .markdown-rendered h3,
        .markdown-rendered h4, .markdown-rendered h5, .markdown-rendered h6 {
            color: #2c3e50;
            margin-top: 20px;
            margin-bottom: 10px;
        }

        .markdown-rendered h1 { font-size: 1.8em; }
        .markdown-rendered h2 { font-size: 1.5em; }
        .markdown-rendered h3 { font-size: 1.3em; }
        .markdown-rendered h4 { font-size: 1.1em; }
        .markdown-rendered h5 { font-size: 1em; }
        .markdown-rendered h6 { font-size: 0.9em; }

        .markdown-rendered p {
            margin-bottom: 12px;
        }

        .markdown-rendered ul, .markdown-rendered ol {
            margin-left: 20px;
            margin-bottom: 12px;
        }

        .markdown-rendered li {
            margin-bottom: 5px;
        }

        .markdown-rendered code {
            background-color: #f1f1f1;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.9em;
        }

        .markdown-rendered pre {
            background-color: #f1f1f1;
            padding: 12px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 12px 0;
        }

        .markdown-rendered pre code {
            background-color: transparent;
            padding: 0;
        }

        .markdown-rendered blockquote {
            border-left: 4px solid #ddd;
            margin: 12px 0;
            padding-left: 16px;
            color: #666;
            font-style: italic;
        }

        .markdown-rendered strong, .markdown-rendered b {
            font-weight: 600;
        }

        .markdown-rendered em, .markdown-rendered i {
            font-style: italic;
        }

        .error {
            background-color: #fee;
            color: #c33;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }

        @media (max-width: 768px) {
            .charts-row {
                flex-direction: column;
            }

            .variant-charts {
                flex-direction: column;
            }

            .summary-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">Kai Evaluation Report</h1>
            <div class="timestamp">Generated on ${new Date(jsonData.timestamp).toLocaleString()}</div>
        </div>

        <!-- Summary Section -->
        <div class="summary-section">
            <h2 style="color: #2c3e50; margin-bottom: 20px;">📊 Summary</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-value">${jsonData.summary.totalTestCases}</div>
                    <div class="summary-label">Test Cases</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${jsonData.summary.totalExperiments}</div>
                    <div class="summary-label">Experiments</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${jsonData.summary.totalErrors}</div>
                    <div class="summary-label">Errors</div>
                </div>
            </div>
        </div>

        <!-- Raw Results Section -->
        <button class="collapsible">🔍 Raw Results</button>
        <div class="content">
            <div class="diff-section">
                <div class="diff-selector">
                    <label>Select Test Case:</label>
                    <select id="testCaseSelect" onchange="updateVariantSelect()">
                        <option value="">Choose a test case...</option>
                        ${Array.from(processedData.applications.values())
                          .map((app) =>
                            Array.from(app.testCases.values())
                              .map(
                                (tc) =>
                                  `<option value="${app.name}|${tc.name}">${app.name} - ${tc.name}</option>`,
                              )
                              .join(""),
                          )
                          .join("")}
                    </select>

                    <label>Select Variant:</label>
                    <select id="variantSelect" onchange="updateModelSelect()" disabled>
                        <option value="">Choose a variant...</option>
                    </select>

                    <label>Select Model:</label>
                    <select id="modelSelect" onchange="showDiff()" disabled>
                        <option value="">Choose a model...</option>
                    </select>
                </div>
                <div id="reasoningContainer" class="reasoning-section" style="display: none;">
                    <div class="reasoning-boxes">
                        <div class="reasoning-box">
                            <div class="reasoning-title">🎯 Completeness</div>
                            <div id="completenessScore" class="reasoning-score"></div>
                            <div id="completenessReasoning" class="reasoning-text"></div>
                        </div>
                        <div class="reasoning-box">
                            <div class="reasoning-title">⚖️ Functional Parity</div>
                            <div id="functionalParityScore" class="reasoning-score"></div>
                            <div id="functionalParityReasoning" class="reasoning-text"></div>
                        </div>
                        <div class="reasoning-box">
                            <div class="reasoning-title">🔧 Residual Effort</div>
                            <div id="residualEffortScore" class="reasoning-score"></div>
                            <div id="residualEffortReasoning" class="reasoning-text"></div>
                        </div>
                    </div>
                </div>
                <div id="diffContainer" class="diff-container" style="display: none;"></div>
            </div>
        </div>

        <!-- Applications Section -->
        ${Array.from(processedData.applications.values())
          .map(
            (app) => `
            <button class="collapsible app-collapsible">📁 ${app.name}</button>
            <div class="content">
                ${Array.from(app.testCases.values())
                  .map(
                    (testCase) => `
                    <button class="collapsible testcase-collapsible">🧪 ${testCase.name}</button>
                    <div class="content">
                        <div class="charts-container">
                            <div class="charts-row">
                                <div class="chart-section weighted-avg-section">
                                    <div class="chart-title">Weighted Average Scores by Variant</div>
                                    <canvas id="weighted-${app.name}-${testCase.name}"></canvas>
                                </div>

                                <div class="chart-section individual-scores-section">
                                    <div class="chart-title">Individual Scores by Variant</div>
                                    <div class="variant-charts">
                                        ${Array.from(processedData.allVariants)
                                          .map(
                                            (variant) => `
                                            <div class="variant-chart">
                                                <div class="variant-title">${variant}</div>
                                                <canvas id="individual-${app.name}-${testCase.name}-${variant}"></canvas>
                                            </div>
                                        `,
                                          )
                                          .join("")}
                                    </div>
                                </div>
                            </div>
                        </div>

                        ${
                          testCase.errors.length > 0
                            ? `
                            <div class="error">
                                <strong>Errors:</strong><br>
                                ${testCase.errors.map((error) => `• ${error}`).join("<br>")}
                            </div>
                        `
                            : ""
                        }

                        <div class="description markdown-content">
                            <strong>Description:</strong>
                            <div id="description-${app.name}-${testCase.name}" class="markdown-rendered"></div>
                        </div>
                    </div>
                `,
                  )
                  .join("")}
            </div>
        `,
          )
          .join("")}
    </div>

    <script>
        // Chart.js configuration
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = false;

        // Data processing
        const evaluationData = ${JSON.stringify(jsonData)};
        const processedData = ${JSON.stringify(
          Array.from(processedData.applications.entries()).map(
            ([name, app]) => [
              name,
              {
                name: app.name,
                testCases: Array.from(app.testCases.entries()),
              },
            ],
          ),
        )};

        const allVariants = ${JSON.stringify(Array.from(processedData.allVariants))};
        const allModels = ${JSON.stringify(Array.from(processedData.allModels))};

        // Color schemes
        const variantColors = {
            'basic': '#3498db',
            'agent': '#e74c3c'
        };

        const metricColors = {
            'completeness': '#2ecc71',
            'functionalParity': '#f39c12',
            'residualEffort': '#9b59b6'
        };

        // Calculate weighted score
        function calculateWeightedScore(metrics) {
            return 0.5 * metrics.completeness.score +
                   0.3 * metrics.functionalParity.score +
                   0.2 * metrics.residualEffort.score;
        }

        // Truncate label to specified length
        function truncateLabel(label, maxLength = 20) {
            if (label.length <= maxLength) return label;
            return label.substring(0, maxLength - 3) + '...';
        }

        // Create weighted average chart
        function createWeightedChart(canvasId, experiments) {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return;

            // Set fixed height for the canvas to prevent growing
            ctx.style.height = '300px';
            ctx.style.maxHeight = '300px';

            // Group by variant
            const variantData = {};
            experiments.forEach(exp => {
                if (!variantData[exp.variant]) {
                    variantData[exp.variant] = [];
                }
                variantData[exp.variant].push({
                    model: exp.model,
                    weightedScore: calculateWeightedScore(exp.metrics)
                });
            });

            const datasets = Object.keys(variantData).map(variant => ({
                label: variant,
                data: allModels.map(model => {
                    const modelData = variantData[variant].find(d => d.model === model);
                    return modelData ? modelData.weightedScore : null;
                }),
                borderColor: variantColors[variant] || '#95a5a6',
                backgroundColor: (variantColors[variant] || '#95a5a6') + '20',
                fill: false,
                tension: 0.1,
                pointRadius: 4,
                pointHoverRadius: 6
            }));

            new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: allModels.map(model => truncateLabel(model)),
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 10,
                            right: 10
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 1,
                            ticks: {
                                stepSize: 0.2,
                                font: {
                                    size: 11
                                }
                            },
                            grid: {
                                display: true
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                font: {
                                    size: 10
                                },
                                callback: function(value, index, ticks) {
                                    return truncateLabel(this.getLabelForValue(value));
                                }
                            },
                            grid: {
                                display: true
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        title: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                title: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    return allModels[index]; // Show full model name in tooltip
                                }
                            }
                        }
                    },
                    elements: {
                        line: {
                            borderWidth: 2
                        }
                    }
                }
            });
        }

        // Create individual scores chart
        function createIndividualChart(canvasId, experiments, variant) {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return;

            const variantExperiments = experiments.filter(exp => exp.variant === variant);
            if (variantExperiments.length === 0) {
                ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
                return;
            }

            const models = variantExperiments.map(exp => exp.model);

            // Set canvas height based on number of models, with reasonable limits
            const baseHeight = Math.min(Math.max(120, models.length * 30), 200);
            ctx.style.height = baseHeight + 'px';
            ctx.style.maxHeight = '200px';

            new Chart(ctx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: models.map(model => truncateLabel(model)),
                    datasets: [
                        {
                            label: 'Completeness',
                            data: variantExperiments.map(exp => exp.metrics.completeness.score),
                            backgroundColor: metricColors.completeness + 'CC',
                            barPercentage: 0.8,
                            categoryPercentage: 0.9
                        },
                        {
                            label: 'Functional Parity',
                            data: variantExperiments.map(exp => exp.metrics.functionalParity.score),
                            backgroundColor: metricColors.functionalParity + 'CC',
                            barPercentage: 0.8,
                            categoryPercentage: 0.9
                        },
                        {
                            label: 'Residual Effort',
                            data: variantExperiments.map(exp => exp.metrics.residualEffort.score),
                            backgroundColor: metricColors.residualEffort + 'CC',
                            barPercentage: 0.8,
                            categoryPercentage: 0.9
                        }
                    ]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 10,
                            bottom: 10,
                            left: 10,
                            right: 10
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            max: 1,
                            ticks: {
                                stepSize: 0.2,
                                font: {
                                    size: 10
                                }
                            },
                            grid: {
                                display: true
                            }
                        },
                        y: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                maxRotation: 15,
                                minRotation: 15,
                                font: {
                                    size: 9
                                },
                                callback: function(value, index, ticks) {
                                    return truncateLabel(this.getLabelForValue(value));
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 8,
                                font: {
                                    size: 10
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                title: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    return models[index]; // Show full model name in tooltip
                                }
                            }
                        }
                    },
                    elements: {
                        bar: {
                            borderWidth: 0
                        }
                    }
                }
            });
        }

        // Render markdown descriptions
        function renderMarkdownDescriptions() {
            processedData.forEach(([appName, app]) => {
                app.testCases.forEach(([testCaseName, testCase]) => {
                    const descriptionElement = document.getElementById(\`description-\${appName}-\${testCaseName}\`);
                    if (descriptionElement && testCase.description) {
                        try {
                            // Check if marked library is available
                            if (typeof marked !== 'undefined') {
                                descriptionElement.innerHTML = marked.parse(testCase.description);
                            } else {
                                // Fallback: simple HTML with line breaks
                                descriptionElement.innerHTML = testCase.description.replace(/\\n/g, '<br>');
                            }
                        } catch (error) {
                            // Fallback on error
                            descriptionElement.innerHTML = testCase.description.replace(/\\n/g, '<br>');
                        }
                    }
                });
            });
        }

        // Initialize all charts
        function initializeCharts() {
            processedData.forEach(([appName, app]) => {
                app.testCases.forEach(([testCaseName, testCase]) => {
                    // Create weighted average chart
                    createWeightedChart(
                        \`weighted-\${appName}-\${testCaseName}\`,
                        testCase.experiments
                    );

                    // Create individual charts for each variant
                    allVariants.forEach(variant => {
                        createIndividualChart(
                            \`individual-\${appName}-\${testCaseName}-\${variant}\`,
                            testCase.experiments,
                            variant
                        );
                    });
                });
            });
        }

        // Collapsible functionality
        document.addEventListener('DOMContentLoaded', function() {
            const collapsibles = document.querySelectorAll('.collapsible');

            collapsibles.forEach(function(collapsible) {
                collapsible.addEventListener('click', function() {
                    this.classList.toggle('active');
                    const content = this.nextElementSibling;
                    content.classList.toggle('active');
                });
            });

            // Initialize charts and render markdown after DOM is loaded
            setTimeout(() => {
                initializeCharts();
                renderMarkdownDescriptions();
            }, 100);
        });

        // Diff viewer functionality
        function updateVariantSelect() {
            const testCaseSelect = document.getElementById('testCaseSelect');
            const variantSelect = document.getElementById('variantSelect');
            const modelSelect = document.getElementById('modelSelect');
            const reasoningContainer = document.getElementById('reasoningContainer');
            const diffContainer = document.getElementById('diffContainer');

            variantSelect.innerHTML = '<option value="">Choose a variant...</option>';
            modelSelect.innerHTML = '<option value="">Choose a model...</option>';
            modelSelect.disabled = true;
            reasoningContainer.style.display = 'none';
            diffContainer.style.display = 'none';

            if (!testCaseSelect.value) {
                variantSelect.disabled = true;
                return;
            }

            const [appName, testCaseName] = testCaseSelect.value.split('|');
            const result = evaluationData.results.find(r =>
                r.testCase.application.name === appName && r.testCase.name === testCaseName
            );

            if (result) {
                const variants = [...new Set(result.experiments.map(exp => exp.variant))];
                variants.forEach(variant => {
                    const option = document.createElement('option');
                    option.value = variant;
                    option.textContent = variant;
                    variantSelect.appendChild(option);
                });
                variantSelect.disabled = false;
            }
        }

        function updateModelSelect() {
            const testCaseSelect = document.getElementById('testCaseSelect');
            const variantSelect = document.getElementById('variantSelect');
            const modelSelect = document.getElementById('modelSelect');
            const reasoningContainer = document.getElementById('reasoningContainer');
            const diffContainer = document.getElementById('diffContainer');

            modelSelect.innerHTML = '<option value="">Choose a model...</option>';
            reasoningContainer.style.display = 'none';
            diffContainer.style.display = 'none';

            if (!testCaseSelect.value || !variantSelect.value) {
                modelSelect.disabled = true;
                return;
            }

            const [appName, testCaseName] = testCaseSelect.value.split('|');
            const variant = variantSelect.value;

            const result = evaluationData.results.find(r =>
                r.testCase.application.name === appName && r.testCase.name === testCaseName
            );

            if (result) {
                // Get models for the selected variant
                const modelsForVariant = result.experiments
                    .filter(exp => exp.variant === variant)
                    .map(exp => exp.model);

                const uniqueModels = [...new Set(modelsForVariant)];
                uniqueModels.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
                modelSelect.disabled = false;
            }
        }

        function showDiff() {
            const testCaseSelect = document.getElementById('testCaseSelect');
            const variantSelect = document.getElementById('variantSelect');
            const modelSelect = document.getElementById('modelSelect');
            const reasoningContainer = document.getElementById('reasoningContainer');
            const diffContainer = document.getElementById('diffContainer');

            if (!testCaseSelect.value || !variantSelect.value || !modelSelect.value) {
                reasoningContainer.style.display = 'none';
                diffContainer.style.display = 'none';
                return;
            }

            const [appName, testCaseName] = testCaseSelect.value.split('|');
            const variant = variantSelect.value;
            const model = modelSelect.value;

            const result = evaluationData.results.find(r =>
                r.testCase.application.name === appName && r.testCase.name === testCaseName
            );

            if (result) {
                // Find the exact experiment that matches both variant AND model
                const experiment = result.experiments.find(exp =>
                    exp.variant === variant && exp.model === model
                );

                if (experiment) {
                    // Show reasoning information
                    document.getElementById('completenessScore').textContent =
                        \`Score: \${experiment.metrics.completeness.score.toFixed(3)}\`;
                    document.getElementById('functionalParityScore').textContent =
                        \`Score: \${experiment.metrics.functionalParity.score.toFixed(3)}\`;
                    document.getElementById('residualEffortScore').textContent =
                        \`Score: \${experiment.metrics.residualEffort.score.toFixed(3)}\`;

                    document.getElementById('completenessReasoning').textContent =
                        experiment.metrics.completeness.reasoning || 'No reasoning provided';
                    document.getElementById('functionalParityReasoning').textContent =
                        experiment.metrics.functionalParity.reasoning || 'No reasoning provided';
                    document.getElementById('residualEffortReasoning').textContent =
                        experiment.metrics.residualEffort.reasoning || 'No reasoning provided';

                    reasoningContainer.style.display = 'block';

                    // Show error if experiment failed
                    if (experiment.error) {
                        diffContainer.innerHTML = \`<div class="error">Experiment Error: \${experiment.error}</div>\`;
                        diffContainer.style.display = 'block';
                        return;
                    }

                    // Show diff if available
                    if (experiment.diff && experiment.diff.trim()) {
                        try {
                            // Check if Diff2Html is available
                            if (typeof Diff2Html !== 'undefined') {
                                const diffHtml = Diff2Html.html(experiment.diff, {
                                    drawFileList: true,
                                    matching: 'lines',
                                    outputFormat: 'side-by-side'
                                });
                                diffContainer.innerHTML = diffHtml;
                                diffContainer.style.display = 'block';
                            } else {
                                // Fallback: show raw diff
                                diffContainer.innerHTML = \`<pre style="padding: 15px; background: #f8f9fa; overflow-x: auto; white-space: pre-wrap;">\${experiment.diff}</pre>\`;
                                diffContainer.style.display = 'block';
                            }
                        } catch (error) {
                            // Fallback: show raw diff with error message
                            diffContainer.innerHTML = \`
                                <div class="error">Error parsing diff: \${error.message}</div>
                                <pre style="padding: 15px; background: #f8f9fa; overflow-x: auto; white-space: pre-wrap;">\${experiment.diff}</pre>
                            \`;
                            diffContainer.style.display = 'block';
                        }
                    } else {
                        diffContainer.innerHTML = '<div class="error">No diff available for this experiment</div>';
                        diffContainer.style.display = 'block';
                    }
                } else {
                    reasoningContainer.style.display = 'none';
                    diffContainer.innerHTML = \`<div class="error">Experiment data not found for variant "\${variant}" and model "\${model}"</div>\`;
                    diffContainer.style.display = 'block';
                }
            } else {
                reasoningContainer.style.display = 'none';
                diffContainer.innerHTML = '<div class="error">Test case data not found</div>';
                diffContainer.style.display = 'block';
            }
        }
    </script>
</body>
</html>`;

  await fs.writeFile(outputPath, html, "utf-8");
}
