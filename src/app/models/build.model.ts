import { BaseStats, DiscSlot, WEngine } from "./agent.model";
import { Disc } from "./disc.model";

// models/build.model.ts
export interface AgentBuild {
  agentId: string;
  level: number;
  mindscapeLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  wEngine?: WEngine;
  wEngineLevel?: number;
  discs: {
    [key in DiscSlot]?: Disc;
  };
  calculatedStats: BaseStats;
  score?: number;
}
