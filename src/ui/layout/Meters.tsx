// The code-size and part-count meters in the status bar (spec §13.5).
import type { JSX } from 'preact';
import { formatPercent } from '../../core/size';
import type { Limits } from '../../core/types';
import { sizeSig } from '../../state/derived';
import { settingsSig } from '../../state/settings';
import { docSig } from '../../state/store';
import { openDialog } from '../../state/ui';

/** Amber starts at this share of a limit. */
const AMBER = 0.75;

export interface MetersView {
  readonly codeText: string;
  readonly codeLevel: 'ok' | 'warn' | 'bad';
  readonly partsText: string;
  readonly partsLevel: 'ok' | 'warn' | 'high' | 'bad';
  readonly partsNote: '' | 'laggy' | 'beyond tested';
}

const digits = (n: number): string => n.toLocaleString('en-US');

/** The text and levels both meters show for a build of `s` parts and `s.base64Chars` characters. */
export function metersView(s: { base64Chars: number; parts: number }, limits: Limits): MetersView {
  const { codeChars, partSoftCap, partWarn } = limits;
  let codeLevel: MetersView['codeLevel'] = 'ok';
  if (s.base64Chars > codeChars) codeLevel = 'bad';
  else if (s.base64Chars >= codeChars * AMBER) codeLevel = 'warn';
  let partsLevel: MetersView['partsLevel'] = 'ok';
  if (s.parts > partWarn) partsLevel = 'bad';
  else if (s.parts > partSoftCap) partsLevel = 'high';
  else if (s.parts >= partSoftCap * AMBER) partsLevel = 'warn';
  return {
    codeText: `Code ${formatPercent(s.base64Chars, codeChars)}% used`,
    codeLevel,
    partsText: `Parts ${digits(s.parts)} / ${digits(partSoftCap)}`,
    partsLevel,
    partsNote: partsLevel === 'bad' ? 'beyond tested' : partsLevel === 'high' ? 'laggy' : '',
  };
}

/** Both meters. Clicking either one opens the Export dialog. */
export function Meters(): JSX.Element {
  const size = sizeSig.value;
  const limits = settingsSig.value.limits;
  const parts = docSig.value.order.length;
  const view = metersView({ base64Chars: size.base64Chars, parts }, limits);
  const codeTip = `${size.jsonBytes} JSON bytes, ${size.base64Chars} base64 chars, limit ${limits.codeChars}`;
  const partsTip = `${parts} parts, soft cap ${limits.partSoftCap}, beyond tested above ${limits.partWarn}`;
  return (
    <div class="meters">
      <button
        class={`meter ${view.codeLevel}`}
        title={codeTip}
        onClick={() => openDialog('export')}
      >
        <span>{view.codeText}</span>
        {view.codeLevel === 'bad' && <span class="meter-note">above tested limit</span>}
      </button>
      <button
        class={`meter ${view.partsLevel}`}
        title={partsTip}
        onClick={() => openDialog('export')}
      >
        <span>{view.partsText}</span>
        {view.partsNote !== '' && <span class="meter-note">{view.partsNote}</span>}
      </button>
    </div>
  );
}
