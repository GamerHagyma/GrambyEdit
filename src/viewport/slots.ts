import type { PartId } from '../core/types';

/**
 * Instance slots for one InstancedMesh. Freed slots are reused first; capacity doubles when full.
 * The caller hides freed slots (zero-scale matrix) and draws `highWater` instances.
 */
export class SlotAllocator {
  private readonly slots = new Map<PartId, number>();
  private readonly free_: number[] = [];
  private cap: number;
  private next = 0;

  constructor(capacity: number) {
    this.cap = Math.max(1, capacity);
  }

  alloc(id: PartId): number {
    const known = this.slots.get(id);
    if (known !== undefined) return known;
    const slot = this.free_.pop() ?? this.next++;
    while (slot >= this.cap) this.cap *= 2;
    this.slots.set(id, slot);
    return slot;
  }

  free(id: PartId): void {
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    this.slots.delete(id);
    this.free_.push(slot);
  }

  slotOf(id: PartId): number | undefined {
    return this.slots.get(id);
  }

  get capacity(): number {
    return this.cap;
  }

  get size(): number {
    return this.slots.size;
  }

  /** One past the highest slot ever handed out. */
  get highWater(): number {
    return this.next;
  }
}
