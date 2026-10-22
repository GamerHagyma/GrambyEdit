import { SlotAllocator } from '../../src/viewport/slots';

test('recycles freed slots and doubles capacity', () => {
  const s = new SlotAllocator(2);
  expect([s.alloc(10), s.alloc(11)]).toEqual([0, 1]);
  s.free(10);
  expect(s.alloc(12)).toBe(0);
  expect(s.alloc(13)).toBe(2);
  expect(s.capacity).toBe(4);
  expect(s.slotOf(11)).toBe(1);
});
test('allocating an id twice returns its slot; the high-water mark covers every slot in use', () => {
  const s = new SlotAllocator(1);
  expect(s.alloc(5)).toBe(s.alloc(5));
  s.alloc(6);
  s.free(5);
  expect([s.size, s.highWater]).toEqual([1, 2]);
});
