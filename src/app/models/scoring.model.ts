import { DiscSlot } from "./agent.model";
import { SubStatType, MainStatType } from "./disc.model";

// models/scoring.model.ts
export interface ScoringAlgorithm {
  name: string;
  weights: {
    [key in SubStatType]?: number;
  };
  mainStatPreferences: {
    [key in DiscSlot]?: MainStatType[];
  };
}
