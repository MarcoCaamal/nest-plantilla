/**
 * An opt-in infrastructure check for a dependency required to serve traffic.
 * Return true only when ready; false or a rejected promise means unavailable.
 * Cooperate with AbortSignal to stop pending I/O after the configured timeout.
 */
export abstract class ReadinessCheckPort {
  abstract readonly name: string;
  abstract check(signal: AbortSignal): Promise<boolean>;
}
