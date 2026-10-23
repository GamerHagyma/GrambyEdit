import type { JSX } from 'preact';
import { assetsSig } from '../../state/store';
import { CREDITS } from '../credits';
import { Dialog } from '../layout/Dialog';

const SOURCES = [
  'https://github.com/JuanCrakYT/RtG-Format',
  'https://github.com/jirrob/GrambysWorkshop',
];

/** The credits, the version of the loaded assets, and the two projects the meshes come from. */
export function AboutDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): JSX.Element | null {
  const version = assetsSig.value?.catalog.version ?? '—';
  return (
    <Dialog title="About GrambyEdit" open={open} onClose={onClose}>
      <p>{CREDITS}</p>
      <p>Assets version: {version}</p>
      <ul>
        {SOURCES.map((url) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
