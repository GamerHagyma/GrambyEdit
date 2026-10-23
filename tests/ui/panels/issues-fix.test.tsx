// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/preact';
import { IssuesPanel } from '../../../src/ui/panels/IssuesPanel';
import { selectionSig } from '../../../src/state/selection';
import {
  baseCatalogSig,
  docSig,
  historySig,
  loadDoc,
  resetStoreForTests,
  undo,
} from '../../../src/state/store';
import { MINI } from '../../helpers/catalog';
import { docOf, mount, part, pt, sock } from '../../helpers/doc';

beforeEach(() => {
  resetStoreForTests();
  baseCatalogSig.value = MINI;
});

const labels = () => historySig.value.past.map((p) => p.label);

test('quick fix removes an unused point', () => {
  loadDoc(docOf(part(1, 'Base', [], {}, [pt('{u}')])));
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText('Remove point'));
  expect(docSig.value.parts.get(1)!.points!.size).toBe(0);
});

test('removing unused points keeps the used one, and is one undoable step', () => {
  loadDoc(
    docOf(part(1, 'Base', [], {}, [pt('{a}'), pt('{b}')]), part(2, 'Part', [mount('1', 1, '{a}')])),
  );
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText('Remove point'));
  expect([...docSig.value.parts.get(1)!.points!.keys()]).toEqual(['{a}']);
  expect(labels()).toEqual(['Remove unused points']);
  expect(screen.queryByText('Remove point')).toBeNull();
  undo();
  expect([...docSig.value.parts.get(1)!.points!.keys()]).toEqual(['{a}', '{b}']);
});

test('a fix click does not also select the parts of its row', () => {
  loadDoc(docOf(part(1, 'Base', [], {}, [pt('{u}')])));
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText('Remove point'));
  expect(selectionSig.value.parts.size).toBe(0);
});

test('Remove this joint drops the later joint on a shared socket, detaching it when it poses the part', () => {
  loadDoc(
    docOf(
      part(1, 'Part'),
      part(2, 'Part', [sock('1', 1, '2')]),
      part(3, 'Part', [sock('1', 1, '2')]),
    ),
  );
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText('Remove this joint'));
  expect(docSig.value.parts.get(3)!.conns).toEqual([]);
  expect(docSig.value.parts.get(2)!.conns).toEqual([sock('1', 1, '2')]);
  expect(docSig.value.layout.has(3)).toBe(true);
  expect(labels()).toEqual(['Remove joint']);
  expect(screen.queryByText('Remove this joint')).toBeNull();
});

test('Remove this joint on a later joint that is not the pose conn keeps the pose conn', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Splitter_2', [sock('5', 1, '2'), sock('9', 1, '2')])));
  render(<IssuesPanel />);
  fireEvent.click(screen.getByText('Remove this joint'));
  expect(docSig.value.parts.get(2)!.conns).toEqual([sock('5', 1, '2')]);
  expect(labels()).toEqual(['Remove joint']);
});
