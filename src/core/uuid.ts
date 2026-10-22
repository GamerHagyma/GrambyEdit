import type { Uuid } from './types';

const UUID = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i;

/** A braced, lower-case uuid, as the game writes them. */
export function newUuid(): Uuid {
  return `{${crypto.randomUUID()}}`;
}

export function isUuid(s: string): boolean {
  return UUID.test(s);
}
