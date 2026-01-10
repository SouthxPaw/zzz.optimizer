import { DiscSet } from "../models/disc.model";

// constants/disc-sets.ts
export const DISC_SETS: DiscSet[] = [
  {
    id: 'fanged_metal',
    name: 'Fanged Metal',
    bonuses: [
      {
        pieces: 2,
        description: 'Physical DMG +10%',
      },
    ],
  },
  {
    id: 'woodpecker_electro',
    name: 'Woodpecker Electro',
    bonuses: [
      {
        pieces: 2,
        description: 'CRIT Rate +8%',
      },
    ],
  },
  {
    id: 'inferno_metal',
    name: 'Inferno Metal',
    bonuses: [
      {
        pieces: 2,
        description: 'Fire DMG +10%',
      },
    ],
  },
  {
    id: 'polar_metal',
    name: 'Polar Metal',
    bonuses: [
      {
        pieces: 2,
        description: 'Ice DMG +10%',
      },
    ],
  },
  {
    id: 'thunder_metal',
    name: 'Thunder Metal',
    bonuses: [
      {
        pieces: 2,
        description: 'Electric DMG +10%',
      },
    ],
  },
  {
    id: 'chaos_jazz',
    name: 'Chaos Jazz',
    bonuses: [
      {
        pieces: 2,
        description: 'Anomaly Proficiency +30',
      },
    ],
  },
  {
    id: 'puffer_electro',
    name: 'Puffer Electro',
    bonuses: [
      {
        pieces: 2,
        description: 'PEN Ratio +8%',
      },
    ],
  },
  {
    id: 'swing_jazz',
    name: 'Swing Jazz',
    bonuses: [
      {
        pieces: 2,
        description: 'Energy Regen +20%',
      },
    ],
  },
  {
    id: 'freedom_blues',
    name: 'Freedom Blues',
    bonuses: [
      {
        pieces: 2,
        description: 'Anomaly Proficiency +30',
      },
      {
        pieces: 4,
        description: 'When Anomaly Buildup deals DMG, deal 5% more DMG. Max 15 stacks.',
      },
    ],
  },
  {
    id: 'hormone_punk',
    name: 'Hormone Punk',
    bonuses: [
      {
        pieces: 2,
        description: 'ATK +10%',
      },
      {
        pieces: 4,
        description: 'When launching an EX Special Attack or Assist Attack, ATK increases by 25% for 15s.',
      },
    ],
  },
  {
    id: 'shockstar_disco',
    name: 'Shockstar Disco',
    bonuses: [
      {
        pieces: 2,
        description: 'Impact +6%',
      },
      {
        pieces: 4,
        description: 'When launching a Chain Attack or Ultimate, DMG increases by 15% for 15s.',
      },
    ],
  },
];
