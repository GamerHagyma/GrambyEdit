// The Parts dock (spec §13.1): favourites, recents, the seven categories and my creations, with search.
import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { CATEGORIES, type PartDef } from '../../core/catalog-types';
import { statsSig } from '../../state/derived';
import { favouritesSig, moveFavourite, pushRecent, recentsSig } from '../../state/favourites';
import { catalogSig, docSig } from '../../state/store';
import { placeFirstPart } from '../../state/place';
import { Icon } from '../icons';
import { fuzzyScore, partScore, rankParts } from '../widgets/fuzzy';
import { PartCard } from '../widgets/PartCard';
import type { PickChoice } from '../widgets/PartPicker';

export interface PartBrowserProps {
  onArm(c: PickChoice): void;
  creations?: readonly { id: string; name: string }[];
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <section class="part-section">
      <h3>{title}</h3>
      {empty ? <p class="part-empty">Nothing here yet</p> : <ul class="part-cards">{children}</ul>}
    </section>
  );
}

export function PartBrowser({ onArm, creations = [] }: PartBrowserProps): JSX.Element {
  const [query, setQuery] = useState('');
  const cat = catalogSig.value;
  const version = cat?.version ?? '';
  const all: PartDef[] = cat ? Object.values(cat.parts) : [];
  const counts = new Map(statsSig.value.types.map((t): [string, number] => [t.type, t.count]));
  const favourites = favouritesSig.value;

  // Favourites and recents keep their own order; only the filter applies to them.
  const known = (types: readonly string[]): PartDef[] =>
    types.map((t) => cat?.parts[t]).filter((p): p is PartDef => p !== undefined);
  const keep = (parts: readonly PartDef[]) => parts.filter((p) => partScore(p, query) > 0);
  const favParts = keep(known(favourites));
  const recentParts = keep(known(recentsSig.value));
  const categories = CATEGORIES.map((title) => ({
    title,
    parts: rankParts(
      all.filter((p) => p.category === title),
      query,
    ),
  }));
  const shownCreations = creations.filter((c) => fuzzyScore(query, c.name) > 0);

  const card = (p: PartDef, onDropPart?: (type: string) => void) => (
    <li key={p.type}>
      <PartCard
        part={p}
        version={version}
        count={counts.get(p.type) ?? 0}
        favourite={favourites.includes(p.type)}
        onArm={() => {
          // Updating Recent can move this card between the two clicks of a double-click.
          // Empty builds record the type when placement succeeds instead.
          if (docSig.value.parts.size !== 0) pushRecent(p.type);
          onArm({ kind: 'part', type: p.type });
        }}
        onDoubleClick={() => {
          if (placeFirstPart(p.type)) pushRecent(p.type);
        }}
        onDropPart={onDropPart}
      />
    </li>
  );

  return (
    <div class="part-browser">
      <div class="part-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Search parts"
          placeholder="Search parts"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        {query !== '' && (
          <button class="icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
            <Icon name="x" />
          </button>
        )}
      </div>
      <Section title="★ Favourites" empty={favParts.length === 0}>
        {favParts.map((p) => card(p, (from) => moveFavourite(from, favourites.indexOf(p.type))))}
      </Section>
      <Section title="Recent" empty={recentParts.length === 0}>
        {recentParts.map((p) => card(p))}
      </Section>
      {categories.map(({ title, parts }) => (
        <Section key={title} title={title} empty={parts.length === 0}>
          {title === 'Unavailable' && (
            <li class="part-empty">
              Not currently spawnable in game. Kept for importing and inspection.
            </li>
          )}
          {parts.map((p) => card(p))}
        </Section>
      ))}
      <Section title="My creations" empty={shownCreations.length === 0}>
        {shownCreations.map((c) => (
          <li key={c.id}>
            <div class="part-card">
              <button class="part-card-arm" onClick={() => onArm({ kind: 'creation', id: c.id })}>
                <span class="part-thumb">
                  <Icon name="box" size={28} />
                </span>
                <span class="part-card-name">{c.name}</span>
              </button>
            </div>
          </li>
        ))}
      </Section>
    </div>
  );
}
