/** Clock is an application boundary; fake it in tests to control time. */
export abstract class ClockPort {
  abstract now(): Date;
}
