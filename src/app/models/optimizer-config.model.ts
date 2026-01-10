import { DiscSlot, MainStatType, SubStatType } from "./agent.model";

// models/optimizer-config.model.ts
export interface OptimizerConfig {
  agentId: string;
  minSpeed?: number;
  maxSpeed?: number;
  preferredMainStats: {
    [key in DiscSlot]?: MainStatType[];
  };
  preferredSets?: string[]; // disc set IDs
  substatWeights: {
    [key in SubStatType]?: number;
  };
  characterPriority: number; // 1 = highest, can steal from lower priority
}
