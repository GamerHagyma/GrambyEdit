// Copied from docs/RTG_BLUEPRINT_FORMAT.md, Appendix A and Appendix B.
import type { Json } from '../../src/core/types';

export const APPENDIX_A_CODE =
  'W1siQ29ubmVjdG9yIixbWyI1IiwiMSIsMTFdXSxbXV0sWyJDb25uZWN0b3IiLFtbIjUiLCIxIiw3XV0sW11dLFsiV2lyZSIsW1siMyIsIjMiLDEwXSxbIjEiLCIxIiw0XV0sW11dLFsiRGVsYXllciIsW10seyJEZWxheURlYWN0aXZhdGlvbiI6dHJ1ZSwiRGVsYXkiOjAuMSwiUkdCIjpbMjEsOTUsMTYzXX1dLFsiTG9vcGVyIixbWyIxIiwiMiIsMTBdXSx7IkRlbGF5IjowLjE1fV0sWyJTaG90Z3VuIixbWyIyIiwiMiIsOF1dLHsiT3JpZW50YXRpb25aIjozNjAsIk9yaWVudGF0aW9uWSI6MzYwLCJPcmllbnRhdGlvblgiOjQ1MH1dLFsiQ29ubmVjdG9yIixbWyI1IiwiMiIsM11dLFtdXSxbIldpcmUiLFtbIjMiLCIxIiwxMF0sWyIxIiwiNiIsMV1dLFtdXSxbIk1hZyIsW1siMSIsIjEiLDZdXSx7IkJ1bGxldHMiOjFlMjJ9XSxbIkdhdGUtQU5EIixbWyI0IiwiNiIsMTJdXSxbXV0sWyJDb25uZWN0b3IiLFtbIjUiLCIyIiwxMl1dLFtdXSxbIkNvbm5lY3RvciIsW1siNSIsIjMiLDJdXSxbXV1d';

export const APPENDIX_A_JSON: Json[] = [
  ['Connector', [['5', '1', 11]], []],
  ['Connector', [['5', '1', 7]], []],
  [
    'Wire',
    [
      ['3', '3', 10],
      ['1', '1', 4],
    ],
    [],
  ],
  ['Delayer', [], { DelayDeactivation: true, Delay: 0.1, RGB: [21, 95, 163] }],
  ['Looper', [['1', '2', 10]], { Delay: 0.15 }],
  ['Shotgun', [['2', '2', 8]], { OrientationZ: 360, OrientationY: 360, OrientationX: 450 }],
  ['Connector', [['5', '2', 3]], []],
  [
    'Wire',
    [
      ['3', '1', 10],
      ['1', '6', 1],
    ],
    [],
  ],
  ['Mag', [['1', '1', 6]], { Bullets: 1e22 }],
  ['Gate-AND', [['4', '6', 12]], []],
  ['Connector', [['5', '2', 12]], []],
  ['Connector', [['5', '3', 2]], []],
];

/** Hand-written and verified in game: Switch → NOT → Light on two ephemeral points of a Base. */
export const APPENDIX_B_JSON: Json[] = [
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

export const SMALLEST_CODE = 'W1siVHJpcFdpcmUiLFtdLHsiQWN0aXZhdGVkIjpmYWxzZSwiTGVuZ3RoIjozMH1dXQ==';
export const SMALLEST_JSON: Json[] = [['TripWire', [], { Activated: false, Length: 30 }]];
