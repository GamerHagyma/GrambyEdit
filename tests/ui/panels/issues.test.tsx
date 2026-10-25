// @vitest-environment jsdom
import { act, render, screen, fireEvent } from '@testing-library/preact';
import { IssuesPanel } from '../../../src/ui/panels/IssuesPanel';
import {
  baseCatalogSig,
  commit,
  loadDoc,
  resetStoreForTests,
  undo,
} from '../../../src/state/store';
import { selectionSig } from '../../../src/state/selection';
import { docOf, mount, part, pt } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
import { realCatalog } from '../../helpers/real-catalog';
import { setPointCFrame } from '../../../src/core/ops/points';

beforeEach(resetStoreForTests);

test('issues grouped by severity select their parts on click', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Mystery')));
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText(/Mystery/));
  expect([...selectionSig.value.parts]).toEqual([1]);
});

test('a stretch warning selects its part, clears when shortened and returns with Undo', async () => {
  baseCatalogSig.value = await realCatalog();
  const up = (x: number) => [x, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
  loadDoc(
    docOf(
      part(1, 'Part', [], {}, [pt('{a}', up(0)), pt('{b}', up(12))]),
      part(2, 'PressurePlate', [mount('1', 1, '{a}'), mount('2', 1, '{b}')]),
    ),
  );
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText(/PressurePlate.*stretched beyond/));
  expect([...selectionSig.value.parts]).toEqual([2]);
  await act(() => {
    commit('Shorten wire', (d) => setPointCFrame(d, 1, '{b}', up(5)));
  });
  expect(screen.queryByText(/PressurePlate.*stretched beyond/)).toBeNull();
  await act(() => {
    undo();
  });
  expect(screen.getByText(/PressurePlate.*stretched beyond/)).toBeTruthy();
});
