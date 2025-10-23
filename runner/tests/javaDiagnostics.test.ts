import { JavaDiagnosticsTasksProvider, JavaDiagnosticsInitParams } from '../src/taskProviders/javaDiagnosticsTasksProvider';
import path from 'path';
import { createLogger, format, transports, Logger } from 'winston';

describe('JavaDiagnosticsTasksProvider Tests', () => {
  let provider: JavaDiagnosticsTasksProvider;
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console()
      ]
    });
    provider = new JavaDiagnosticsTasksProvider(logger);
  });

  afterEach(async () => {
    if (provider.isInitialized()) {
      await provider.stop();
    }
  });

  it('should initialize diagnostics provider', async () => {
    const jdtBinaryPath = process.env.JDTLS_BINARY_PATH;
    const testJavaProjectPath = path.resolve(__dirname, 'test-data/java');
    const workspacePaths = [testJavaProjectPath];
    const bundles = process.env.JDTLS_BUNDLES?.split(',') || [];
    const jvmMaxMem = process.env.JVM_MAX_MEM;

    if (!jdtBinaryPath || bundles.length === 0) {
      throw new Error('JDTLS_BINARY_PATH and JDTLS_BUNDLES environment variables required');      
    }

    logger.info('Initializing JavaDiagnosticsTasksProvider with:');
    logger.info('- JDTLS Binary Path:', jdtBinaryPath);
    logger.info('- Workspace Paths:', workspacePaths);
    logger.info('- Bundles:', bundles);
    logger.info('- JVM Max Memory:', jvmMaxMem);

    const initParams: JavaDiagnosticsInitParams = {
      jdtBinaryPath,
      workspacePaths,
      bundles,
      jvmMaxMem,
    };

    try {
      const result = await provider.init(initParams);
      logger.info('Initialization successful, pipe name:', result.pipeName);
      expect(provider.isInitialized()).toBe(true);
      logger.info('Waiting for JDTLS to process workspace...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      const tasks = await provider.getCurrentTasks();
      logger.info(`Retrieved ${tasks.length} diagnostic tasks`);
      if (tasks.length > 0) {
        logger.info('Sample diagnostic tasks:');
        tasks.slice(0, 5).forEach((task, index) => {
          logger.info(`Task ${index + 1}:`, task.toJSON());
        });
      }
      logger.info('Waiting for additional diagnostics...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      const finalTasks = await provider.getCurrentTasks();
      logger.info(`Final diagnostic count: ${finalTasks.length}`);
    } catch (error) {
      logger.error('Error during test:', error);
      if (provider) {
        await provider.stop();
      }
      throw error;
    }
  }, 30000); // 30 second timeout for JDTLS startup

  it('should handle file change events', async () => {
    if (!provider.isInitialized()) {
      logger.info('Skipping file change test: provider not initialized');
      return;
    }
    const testJavaProjectPath = path.resolve(__dirname, 'test-data/java');
    const mainJavaFilePath = path.join(testJavaProjectPath, 'src/main/java/com/example/Main.java');
    const fileChangeEvent = {
      path: mainJavaFilePath,
      type: 'modified' as const,
      timestamp: new Date(),
    };
    await provider.onFileChange?.(fileChangeEvent);
    logger.info('File change event processed');
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
});