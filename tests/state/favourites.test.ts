// @vitest-environment jsdom
import {
  favouritesSig,
  moveFavourite,
  pushRecent,
  recentsSig,
  toggleFavourite,
} from '../../src/state/favourites';

beforeEach(() => localStorage.clear());

test('favourites persist and reorder; recents are unique and capped at 12', () => {
  toggleFavourite('Part');
  toggleFavourite('Connector');
  moveFavourite('Connector', 0);
  expect(favouritesSig.value).toEqual(['Connector', 'Part']);
  expect(JSON.parse(localStorage.getItem('grambyedit:favourites')!)).toEqual(['Connector', 'Part']);
  for (let i = 0; i < 14; i++) pushRecent(`T${i}`);
  pushRecent('T13');
  expect(recentsSig.value).toHaveLength(12);
  expect(recentsSig.value[0]).toBe('T13');
});
