import type {
  CreateObservationalMemoryInput,
  CreateReflectionGenerationInput,
  ObservationalMemoryHistoryOptions,
  ObservationalMemoryRecord,
  SwapBufferedReflectionToActiveInput,
  SwapBufferedToActiveInput,
  SwapBufferedToActiveResult,
  UpdateActiveObservationsInput,
  UpdateBufferedObservationsInput,
  UpdateBufferedReflectionInput,
  UpdateObservationalMemoryConfigInput,
} from "@mastra/core/storage";
import { MemoryStorage } from "@mastra/core/storage";

/**
 * Keeps Engenty's thread/message persistence while delegating Mastra-owned
 * observational state to the Postgres memory domain.
 */
export abstract class ObservationalMemoryDelegatingStorage extends MemoryStorage {
  static readonly #writeLocks = new Map<string, Promise<void>>();
  override readonly supportsObservationalMemory = Boolean(
    process.env.SUPABASE_DB_URL?.trim() ||
      process.env.ENGENTY_WORKSPACE_VECTOR_DB_URL?.trim()
  );

  protected abstract getRuntimeMemoryStore(): Promise<MemoryStorage | null>;

  private async requireRuntimeMemoryStore(): Promise<MemoryStorage> {
    const store = await this.getRuntimeMemoryStore();
    if (!store?.supportsObservationalMemory) {
      throw new Error(
        "Observational memory requires the configured Mastra Postgres memory store"
      );
    }
    return store;
  }

  private async withWriteLock<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous =
      ObservationalMemoryDelegatingStorage.#writeLocks.get(key) ??
      Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    ObservationalMemoryDelegatingStorage.#writeLocks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (
        ObservationalMemoryDelegatingStorage.#writeLocks.get(key) === queued
      ) {
        ObservationalMemoryDelegatingStorage.#writeLocks.delete(key);
      }
    }
  }

  override async getObservationalMemory(
    threadId: string | null,
    resourceId: string
  ): Promise<ObservationalMemoryRecord | null> {
    const store = await this.getRuntimeMemoryStore();
    return store?.supportsObservationalMemory
      ? store.getObservationalMemory(threadId, resourceId)
      : null;
  }

  override async getObservationalMemoryHistory(
    threadId: string | null,
    resourceId: string,
    limit?: number,
    options?: ObservationalMemoryHistoryOptions
  ): Promise<ObservationalMemoryRecord[]> {
    const store = await this.getRuntimeMemoryStore();
    return store?.supportsObservationalMemory
      ? store.getObservationalMemoryHistory(
          threadId,
          resourceId,
          limit,
          options
        )
      : [];
  }

  override async initializeObservationalMemory(
    input: CreateObservationalMemoryInput
  ): Promise<ObservationalMemoryRecord> {
    return (
      await this.requireRuntimeMemoryStore()
    ).initializeObservationalMemory(input);
  }

  override async updateActiveObservations(
    input: UpdateActiveObservationsInput
  ): Promise<void> {
    await this.withWriteLock(input.id, async () => {
      await (await this.requireRuntimeMemoryStore()).updateActiveObservations(
        input
      );
    });
  }

  override async updateBufferedObservations(
    input: UpdateBufferedObservationsInput
  ): Promise<void> {
    await (await this.requireRuntimeMemoryStore()).updateBufferedObservations(
      input
    );
  }

  override async swapBufferedToActive(
    input: SwapBufferedToActiveInput
  ): Promise<SwapBufferedToActiveResult> {
    return (await this.requireRuntimeMemoryStore()).swapBufferedToActive(input);
  }

  override async createReflectionGeneration(
    input: CreateReflectionGenerationInput
  ): Promise<ObservationalMemoryRecord> {
    return this.withWriteLock(input.currentRecord.id, async () =>
      (await this.requireRuntimeMemoryStore()).createReflectionGeneration(input)
    );
  }

  override async updateBufferedReflection(
    input: UpdateBufferedReflectionInput
  ): Promise<void> {
    await (await this.requireRuntimeMemoryStore()).updateBufferedReflection(
      input
    );
  }

  override async swapBufferedReflectionToActive(
    input: SwapBufferedReflectionToActiveInput
  ): Promise<ObservationalMemoryRecord> {
    return (
      await this.requireRuntimeMemoryStore()
    ).swapBufferedReflectionToActive(input);
  }

  override async setReflectingFlag(
    id: string,
    isReflecting: boolean
  ): Promise<void> {
    await (await this.requireRuntimeMemoryStore()).setReflectingFlag(
      id,
      isReflecting
    );
  }

  override async setObservingFlag(
    id: string,
    isObserving: boolean
  ): Promise<void> {
    await (await this.requireRuntimeMemoryStore()).setObservingFlag(
      id,
      isObserving
    );
  }

  override async setBufferingObservationFlag(
    id: string,
    isBuffering: boolean,
    lastBufferedAtTokens?: number
  ): Promise<void> {
    await (await this.requireRuntimeMemoryStore()).setBufferingObservationFlag(
      id,
      isBuffering,
      lastBufferedAtTokens
    );
  }

  override async setBufferingReflectionFlag(
    id: string,
    isBuffering: boolean
  ): Promise<void> {
    await (await this.requireRuntimeMemoryStore()).setBufferingReflectionFlag(
      id,
      isBuffering
    );
  }

  override async insertObservationalMemoryRecord(
    record: ObservationalMemoryRecord
  ): Promise<void> {
    await (
      await this.requireRuntimeMemoryStore()
    ).insertObservationalMemoryRecord(record);
  }

  override async clearObservationalMemory(
    threadId: string | null,
    resourceId: string
  ): Promise<void> {
    const store = await this.getRuntimeMemoryStore();
    if (store?.supportsObservationalMemory) {
      await store.clearObservationalMemory(threadId, resourceId);
    }
  }

  override async setPendingMessageTokens(
    id: string,
    tokenCount: number
  ): Promise<void> {
    await (await this.requireRuntimeMemoryStore()).setPendingMessageTokens(
      id,
      tokenCount
    );
  }

  override async updateObservationalMemoryConfig(
    input: UpdateObservationalMemoryConfigInput
  ): Promise<void> {
    await (
      await this.requireRuntimeMemoryStore()
    ).updateObservationalMemoryConfig(input);
  }
}
