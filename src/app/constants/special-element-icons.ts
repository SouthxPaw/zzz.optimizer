/**
 * Special element icon variants.
 *
 * A handful of agents deal a named variant of a base element (Miyabi's Frost is
 * an Ice variant, Sunbringer's Genesis Flare is a Fire variant, and so on). The
 * agent's `element` stays the base element - it drives scoring, status effect
 * type and the element filter - while `specialElementIcon` only swaps the icon
 * that gets displayed.
 *
 * Adding a new variant means one entry here plus the matching
 * `assets/data/images/elements/Icon<Name>.webp` image.
 */

/** Agent ID -> special element icon name. */
export const SPECIAL_ELEMENT_ICONS: { [agentId: string]: string } = {
  '1091': 'Frost',         // Miyabi - Ice variant
  '1371': 'AuricInk',      // Yi Xuan - Ether variant
  '1431': 'HonedEdge',     // Ye Shunguang - Physical variant
  '1601': 'GenesisFlare',  // Sunbringer - Fire variant
};

/**
 * Resolve an agent's special element icon name, if it has one.
 * Accepts either a numeric or string agent ID.
 */
export function getSpecialElementIcon(agentId: string | number): string | undefined {
  return SPECIAL_ELEMENT_ICONS[agentId.toString()];
}

/**
 * Icon name -> image filename, for every special element variant.
 * Derived from SPECIAL_ELEMENT_ICONS so the two can never drift apart.
 */
export const SPECIAL_ELEMENT_ICON_FILES: { [iconName: string]: string } =
  Object.fromEntries(
    Object.values(SPECIAL_ELEMENT_ICONS).map((name) => [name, `Icon${name}.webp`])
  );
