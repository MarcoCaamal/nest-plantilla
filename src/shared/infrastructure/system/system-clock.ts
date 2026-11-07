import { ClockPort } from '@/shared/application/ports/clock.port';

/** Optional built-in system adapter. Bind explicitly when a feature uses ClockPort. */
export class SystemClock extends ClockPort {
  now(): Date {
    return new Date();
  }
}
