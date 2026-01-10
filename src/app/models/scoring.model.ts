import { SubStatType, DiscSlot, MainStatType } from "./agent.model";

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
