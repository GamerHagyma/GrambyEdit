// Built-in example builds for the first-run dialog. Both come from docs/RTG_BLUEPRINT_FORMAT.md:
// Appendix A is a real code, copied as text; Appendix B is hand-written and VERIFIED in game, so
// its entries are encoded here.
import { encode } from './codec';
import type { Json } from './types';

const APPENDIX_A_CODE =
  'W1siQ29ubmVjdG9yIixbWyI1IiwiMSIsMTFdXSxbXV0sWyJDb25uZWN0b3IiLFtbIjUiLCIxIiw3XV0sW11dLFsiV2lyZSIsW1siMyIsIjMiLDEwXSxbIjEiLCIxIiw0XV0sW11dLFsiRGVsYXllciIsW10seyJEZWxheURlYWN0aXZhdGlvbiI6dHJ1ZSwiRGVsYXkiOjAuMSwiUkdCIjpbMjEsOTUsMTYzXX1dLFsiTG9vcGVyIixbWyIxIiwiMiIsMTBdXSx7IkRlbGF5IjowLjE1fV0sWyJTaG90Z3VuIixbWyIyIiwiMiIsOF1dLHsiT3JpZW50YXRpb25aIjozNjAsIk9yaWVudGF0aW9uWSI6MzYwLCJPcmllbnRhdGlvblgiOjQ1MH1dLFsiQ29ubmVjdG9yIixbWyI1IiwiMiIsM11dLFtdXSxbIldpcmUiLFtbIjMiLCIxIiwxMF0sWyIxIiwiNiIsMV1dLFtdXSxbIk1hZyIsW1siMSIsIjEiLDZdXSx7IkJ1bGxldHMiOjFlMjJ9XSxbIkdhdGUtQU5EIixbWyI0IiwiNiIsMTJdXSxbXV0sWyJDb25uZWN0b3IiLFtbIjUiLCIyIiwxMl1dLFtdXSxbIkNvbm5lY3RvciIsW1siNSIsIjMiLDJdXSxbXV1d';

const APPENDIX_B: Json[] = [
  [
    'Base',
    [],
    {
      EphemeralAttachments: {
        '{uuid1}': { partName: 'Base', cframe: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
        '{uuid2}': { partName: 'Base', cframe: [2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
      },
    },
  ],
  ['Switch', [['3', '{uuid1}', 1]], []],
  ['Gate-NOT', [['4', '{uuid2}', 1]], []],
  ['Light', [['1', '2', 3]], { Activated: true }],
];

/** Switch → NOT → Light on two ephemeral points of a Base, and the wired gate demo. */
export const EXAMPLES: readonly { readonly name: string; readonly code: string }[] = [
  { name: 'Switch, NOT gate and light', code: encode(APPENDIX_B) },
  { name: 'Wired gate demo', code: APPENDIX_A_CODE },
];
