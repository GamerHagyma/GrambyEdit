import type { JSX } from 'preact';
import { CREDITS } from './credits';

export function App(): JSX.Element {
  return (
    <>
      <header>GrambyEdit</header>
      <footer>
        <small>{CREDITS}</small>
      </footer>
    </>
  );
}
