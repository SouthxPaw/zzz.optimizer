// Upgrade Plan model for user-customizable build templates
// Users can create custom plans with their own stat priorities, breakpoints, and preferences

export interface UpgradePlan {
  id: string;
  name: string;  // Fully custom user-defined name
  agentId: string;  // Which agent this plan is for
  description?: string;

  // Disc set preferences
  setPreferences: {
    type: '4pc+2pc' | '2pc+2pc+2pc';
    preferredSets: string[];  // Array of set names
  };

  // Main stat preferences per slot (only Drive4/5/6)
  // User marks each possible main stat as Acceptable or Not Acceptable
  mainStatPreferences: {
    Drive4: { [stat: string]: 'Acceptable' | 'Not Acceptable' };
    Drive5: { [stat: string]: 'Acceptable' | 'Not Acceptable' };
    Drive6: { [stat: string]: 'Acceptable' | 'Not Acceptable' };
  };

  // Substat priorities per slot (all 6 drives)
  // User sets priority level for each substat: Essential/Important/Nice/Ignore
  substatPriorities: {
    [slot: string]: {  // Drive1-6
      [stat: string]: 'Essential' | 'Important' | 'Nice' | 'Ignore';
    };
  };

  // Custom breakpoints (overrides agent-breakpoints.json)
  // Initially populated from agent-breakpoints.json, user can edit
  // Values stored as raw numbers:
  // - Percentage stats (critRate, critDmg, penRatio, energyRegen): store as whole number (50 = 50%)
  // - Flat stats (hp, atk, def, etc): store as actual value (1400 = 1400 ATK)
  customBreakpoints: {
    [stat: string]: {
      min: number;
      optimal: number;
    };
  };

  createdAt: Date;
  updatedAt: Date;
}
