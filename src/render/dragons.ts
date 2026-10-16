// Dragon element colours for the tiles in the capsules (src/ui/views.ts `elementTile`): a coloured
// tile with one character, so it reads without the colour too. No Riot art (CLAUDE.md rule 7).

import type { Element } from '../model/types.ts';

export const ELEMENT_COLOUR: Record<Element | 'elder', string> = {
  infernal: '#E8643C', ocean: '#3FA2E0', mountain: '#B98A55', cloud: '#BFD3E6',
  hextech: '#46CBC8', chemtech: '#8FCB45', elder: '#C7A4F2',
};
