import { Logger } from "winston";

export interface DebounceConfig<TEvent> {
  debounceMs: number;
  processor: (events: TEvent[]) => Promise<void>;
  filter?: (events: TEvent[]) => TEvent[];
  deduplicate?: (events: TEvent[]) => TEvent[];
}

export class EventDebouncer<TEvent> {
  private eventQueue: TEvent[] = [];
  private debounceTimer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(private readonly logger: Logger, private readonly config: DebounceConfig<TEvent>) {
    this.logger = logger.child({ module: 'EventDebouncer' });
  }

  addEvent(event: TEvent): void {
    this.eventQueue.push(event);
    this.scheduleProcessing();
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  getQueueLength(): number {
    return this.eventQueue.length;
  }

  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    await this.processQueue();
  }

  async waitUntilIdle(timeoutMs: number = 10000): Promise<void> {
    const startTime = Date.now();
    const checkIdle = async (): Promise<void> => {
      if (Date.now() - startTime > timeoutMs) {
        this.logger.warn("EventDebouncer waitUntilIdle timed out", { timeoutMs });
        return;
      }
      if (this.eventQueue.length > 0 || this.isProcessing) {
        if (this.eventQueue.length > 0 && !this.isProcessing) {
          await this.flush();
        }
        await new Promise(resolve => setTimeout(resolve, 50));
        return checkIdle();
      }
    };
    await checkIdle();
  }

  private scheduleProcessing(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.isProcessing) {
      return;
    }
    this.debounceTimer = setTimeout(() => {
      this.processQueue();
    }, this.config.debounceMs);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const eventsToProcess = [...this.eventQueue];
      this.eventQueue = [];

      this.logger.debug("Processing batch of events", { eventCount: eventsToProcess.length });

      let filteredEvents = eventsToProcess;
      if (this.config.filter) {
        filteredEvents = this.config.filter(eventsToProcess);
        this.logger.silly("Filtered relevant events", { eventCount: filteredEvents.length });
      }

      if (this.config.deduplicate) {
        filteredEvents = this.config.deduplicate(filteredEvents);
        this.logger.silly("Deduplicated unique events", { eventCount: filteredEvents.length });
      }

      if (filteredEvents.length > 0) {
        await this.config.processor(filteredEvents);
        this.logger.debug("Successfully processed events", { eventCount: filteredEvents.length });
      } else {
        this.logger.debug("No events to process after filtering");
      }
    } catch (error) {
      this.logger.error("Error processing event batch", { error });
    } finally {
      this.isProcessing = false;
      if (this.eventQueue.length > 0) {
        this.logger.debug("New events queued during processing, scheduling next batch", {
          queueLength: this.eventQueue.length
        });
        this.scheduleProcessing();
      }
    }
  }
}
