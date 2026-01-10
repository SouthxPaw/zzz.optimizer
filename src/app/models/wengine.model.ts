import { BaseStats, Specialty } from "./agent.model";

// models/wengine.model.ts
export interface WEngine {
  id: string;
  name: string;
  rarity: 'B' | 'A' | 'S';
  specialty: Specialty;
  baseAtk: number;
  subStat: {
    type: keyof BaseStats;
    value: number;
  };
  passive: {
    name: string;
    description: string;
  };
}
