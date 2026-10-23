// One part in the Parts dock (spec §13.1): thumbnail, name, count in this build and a favourite star.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { PartDef } from '../../core/catalog-types';
import { thumbnailUrl } from '../../assets/thumbnails';
import { toggleFavourite } from '../../state/favourites';
import { dragTypeSig } from '../../state/place';
import { Icon } from '../icons';

/** The drag payload: the part type. The viewport reads it when a part is dropped there. */
export const PART_MIME = 'application/x-grambyedit-part';

export interface PartCardProps {
  part: PartDef;
  version: string;
  /** How many of this type the current build uses. */
  count: number;
  favourite: boolean;
  onArm(): void;
  /** Set on favourite cards: receives the type of a part card dropped onto this one. */
  onDropPart?(type: string): void;
}

/** The hover text: game tooltip, socket count and corpus usage (spec §13.1). */
function hoverText(part: PartDef): string {
  return [
    part.tooltip,
    `${Object.keys(part.sockets).length} sockets`,
    `used ${part.corpusCount.toLocaleString('en-US')}× in 185 real builds`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function PartCard({
  part,
  version,
  count,
  favourite,
  onArm,
  onDropPart,
}: PartCardProps): JSX.Element {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    thumbnailUrl(part.type, version).then(
      (url) => {
        if (live) setThumb(url);
      },
      // Not rendered yet, or the browser cannot store it: the placeholder stays, without noise.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [part.type, version]);

  const allowDrop = (e: DragEvent) => e.preventDefault();
  const dropOnto = (e: DragEvent) => {
    e.preventDefault();
    const from = e.dataTransfer?.getData(PART_MIME);
    if (from && onDropPart) onDropPart(from);
  };

  return (
    <div
      class="part-card"
      draggable
      title={hoverText(part)}
      onDragStart={(e) => {
        e.dataTransfer?.setData(PART_MIME, part.type);
        dragTypeSig.value = part.type;
      }}
      onDragEnd={() => {
        dragTypeSig.value = null;
      }}
      onDragOver={onDropPart ? allowDrop : undefined}
      onDrop={onDropPart ? dropOnto : undefined}
    >
      <button class="part-card-arm" onClick={onArm}>
        <span class="part-thumb">
          {thumb ? (
            <img src={thumb} width={64} height={64} alt="" />
          ) : (
            <Icon name="box" size={28} />
          )}
        </span>
        <span class="part-card-name">{part.type}</span>
        <span class="part-badge">{count}</span>
      </button>
      <button
        class="icon-button part-star"
        aria-label={`Favourite ${part.type}`}
        aria-pressed={favourite}
        onClick={() => toggleFavourite(part.type)}
      >
        <Icon name="star" />
      </button>
    </div>
  );
}
