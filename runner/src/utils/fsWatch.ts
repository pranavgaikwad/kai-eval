import chokidar from "chokidar";
import type { Logger } from "winston";

export interface FileWatchCapable {
  onFileChange?: (event: FileChangeEvent) => Promise<void>;
}

export interface FileChangeEvent {
  path: string;
  type: "created" | "modified" | "deleted";
  timestamp: Date;
}

export class SharedFileWatcher {
  private static instance?: SharedFileWatcher;
  private basePaths: string[] = [];
  private providers: Set<FileWatchCapable> = new Set();
  private watcher?: chokidar.FSWatcher;
  private isWatching = false;

  private watchOptions: chokidar.WatchOptions = {
    ignored: [
      "**/.git/**",
      "**/.svn/**",
      "**/.hg/**",
      "**/target/**",
      "**/.gradle/**",
      "**/build/**",
      "**/*.class",
      "**/*.jar",
      "**/*.war",
      "**/*.ear",
      "**/gradle-wrapper.jar",
      "**/node_modules/**",
      "**/.next/**",
      "**/.nuxt/**",
      "**/coverage/**",
      "**/.nyc_output/**",
      "**/__pycache__/**",
      "**/*.pyc",
      "**/*.pyo",
      "**/*.pyd",
      "**/.venv/**",
      "**/venv/**",
      "**/.pytest_cache/**",
      "**/*.exe",
      "**/.vscode/**",
      "**/.idea/**",
      "**/*.swp",
      "**/*.swo",
      "**/*~",
      "**/.DS_Store",
      "**/Thumbs.db",
      "**/desktop.ini",
      "**/*.log",
      "**/.tmp/**",
      "**/.cache/**",
    ],
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    depth: undefined,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  };

  static getInstance(logger: Logger, basePaths: string[]): SharedFileWatcher {
    if (!SharedFileWatcher.instance) {
      SharedFileWatcher.instance = new SharedFileWatcher(logger);
    }
    SharedFileWatcher.instance.basePaths = basePaths;
    return SharedFileWatcher.instance;
  }

  private constructor(private readonly logger: Logger) {
    this.logger = logger.child({ module: "SharedFileWatcher" });
  }

  registerProvider(provider: FileWatchCapable): void {
    this.providers.add(provider);
  }

  unregisterProvider(provider: FileWatchCapable): void {
    this.providers.delete(provider);
  }

  async start(): Promise<void> {
    if (this.isWatching) {
      this.logger.info("File watcher is already running");
      return;
    }

    if (this.basePaths.length === 0) {
      throw new Error("No base paths configured for file watching");
    }

    this.logger.info("Starting file watcher for paths", {
      paths: this.basePaths,
    });

    try {
      this.watcher = chokidar.watch(this.basePaths, this.watchOptions);

      this.watcher
        .on("add", (path) => this.handleFileEvent(path, "created"))
        .on("change", (path) => this.handleFileEvent(path, "modified"))
        .on("unlink", (path) => this.handleFileEvent(path, "deleted"))
        .on("addDir", (path) => this.handleFileEvent(path, "created"))
        .on("unlinkDir", (path) => this.handleDirectoryDeleted(path))
        .on("error", (error) => this.handleWatchError(error))
        .on("ready", () => {
          this.logger.debug("File watcher is ready and watching base paths", {
            basePathCount: this.basePaths.length,
          });
        });

      this.isWatching = true;
      this.logger.debug("File watcher started successfully");
    } catch (error) {
      this.logger.error({ msg: "Failed to start file watcher", error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isWatching) {
      this.logger.info("File watcher is not running");
      return;
    }

    this.logger.info("Stopping file watcher");

    try {
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = undefined;
      }

      this.isWatching = false;
      this.providers.clear();
      this.logger.debug("File watcher stopped successfully");
    } catch (error) {
      this.logger.error({ msg: "Error stopping file watcher", error });
      throw error;
    }
  }

  isRunning(): boolean {
    return this.isWatching;
  }

  getWatchedPaths(): string[] {
    return [...this.basePaths];
  }

  getProviderCount(): number {
    return this.providers.size;
  }

  private async handleFileEvent(
    filePath: string,
    eventType: "created" | "modified" | "deleted",
  ): Promise<void> {
    const event: FileChangeEvent = {
      path: filePath,
      type: eventType,
      timestamp: new Date(),
    };
    this.logger.debug("File event", { eventType, filePath });
    const notificationPromises = Array.from(this.providers).map(
      async (provider) => {
        try {
          if (provider.onFileChange) {
            await provider.onFileChange(event);
          }
        } catch (error) {
          this.logger.error({
            msg: "Error notifying provider about file change",
            error,
          });
        }
      },
    );
    await Promise.allSettled(notificationPromises);
  }

  private async handleDirectoryDeleted(dirPath: string): Promise<void> {
    this.logger.debug("Directory deleted", { dirPath });
    const deletedBasePathIndex = this.basePaths.findIndex(
      (basePath) => dirPath === basePath || basePath.startsWith(dirPath + "/"),
    );
    if (deletedBasePathIndex >= 0) {
      this.logger.warn("Watched base path was deleted", { dirPath });
      this.basePaths.splice(deletedBasePathIndex, 1);
      if (this.basePaths.length === 0) {
        this.logger.warn(
          "All watched paths have been deleted, stopping file watcher",
        );
        await this.stop();
        return;
      }
    }
    await this.handleFileEvent(dirPath, "deleted");
  }

  private handleWatchError(error: Error): void {
    this.logger.error({ msg: "File watcher error", error });
    if (error.message.includes("ENOENT") || error.message.includes("ENOTDIR")) {
      this.logger.warn(
        "Watch target no longer exists, this is usually handled automatically",
      );
    } else {
      this.logger.error({ msg: "Unexpected file watcher error", error });
    }
  }
}
