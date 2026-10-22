// @vitest-environment jsdom
import { render, screen } from '@testing-library/preact';
import { App } from '../../src/ui/App';
import { CREDITS } from '../../src/ui/credits';

test('shell shows the product name and the Mumble Games credit', () => {
  render(<App />);
  expect(screen.getByText('GrambyEdit')).toBeTruthy();
  expect(screen.getByText(CREDITS)).toBeTruthy();
  expect(CREDITS).toBe(
    "Road to Gramby's and all part meshes © Mumble Games. Mesh exports: JuanCrakYT/RtG-Format and jirrob/GrambysWorkshop (MIT).",
  );
});
