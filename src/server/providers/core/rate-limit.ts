/**
 * Serializa llamadas y garantiza un intervalo mínimo entre el inicio de cada una
 * (p. ej. Nominatim: máximo 1 petición por segundo).
 */
export class RateLimiter {
  private nextSlot = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const turn = this.queue.then(async () => {
      const wait = this.nextSlot - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextSlot = this.now() + this.intervalMs;
    });
    this.queue = turn;
    return turn.then(task);
  }
}
