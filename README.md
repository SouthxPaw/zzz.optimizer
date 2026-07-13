# ZZZ Optimizer

A comprehensive build optimizer and character builder for **Zenless Zone Zero** (ZZZ). Manage your agents, W-Engines, disc sets, and calculate optimal builds with real-time stat calculations and scoring.

![Version](https://img.shields.io/badge/version-6.5.41-blue.svg)
![Angular](https://img.shields.io/badge/Angular-19.2-red.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- **Character Build Management**: Create and manage multiple builds for your agents
- **Real-Time Stat Calculation**: Automatically calculates all stats including:
  - Base stats (ie: HP%, ATK%, DEF%)
  - Critical Rate & Critical Damage
  - Anomaly Proficiency & Mastery
  - Impact, PEN, and Energy Regen
  - Disc set bonuses (2pc and 4pc effects)
  - W-Engine effects and stat bonuses
  - Mindscape (Cinema) effects

- **Disc Inventory System**:
  - Create and manage your disc inventory
  - Filter discs by set, slot, and equipped status
  - Real-time disc scoring based on agent preferences
  - Quality ratings from VOID HUNTER (absolute perfection) to F (fodder)
  - Elite tiers: VOID HUNTER, PHAETHON, SSS, SS, S, A, B, C, D, F

- **Build Scoring & Optimization**:
  - **Composite Build Rating System** (5 components):
    - Disc Quality (50%): Average quality of equipped discs
    - Breakpoint Score (20%): Meeting agent-specific stat goals
    - Stat Efficiency (15%): Smart stat allocation and balance
    - Damage Output (10%): Estimated damage with agent/W-Engine synergies
    - Set Bonus (5%): Disc set alignment with agent needs
  - **Advanced Features**:
    - Diminishing returns on over-invested stats
    - Breakpoint penalties for missing critical thresholds
    - Roll count tracking for substats
    - Agent and W-Engine damage modifiers (DEF Shred, DMG Bonuses, etc.)
  - **Elite Rating Tiers**: VOID HUNTER, PHAETHON, SSS, SS, S, A, B, C, D, F

- **Data Import/Export**:
  - Export your builds and disc inventory as JSON
  - Import builds from backup files
  - Merge or replace existing data
  - **Enka Network UID Import**: Search and import character builds directly from Enka Network using player UIDs

- **Build Sharing**:
  - Generate downloadable build images with stats and disc details
  - Customize backgrounds and colors to personalize your share images
  - Toggle visibility of build ratings and scores

- **Automatic Update Notifications**:
  - Background checks every 30 minutes for new versions
  - Non-intrusive update button appears when updates are available
  - Update when convenient - no forced reloads

- **Changelog Viewer**: Track version history, new features, and bug fixes with in-app changelog

- **Persistent Storage**: All data stored locally in IndexedDB (no server required)
- **Mobile Responsive**: Fully optimized for mobile devices

## Live Demo

Visit the live site: [ZZZ Optimizer](https://southxpaw.github.io/zzz.optimizer/)

## Getting Started

## Usage

### Adding a Character Build

1. Click **"+ Add Agent"** button
2. Select an agent from the list
3. Choose a W-Engine
4. Equip disc sets (2pc or 4pc bonuses)
5. View calculated stats and build rating

### Managing Disc Inventory

1. Navigate to the disc slot you want to fill
2. Click **"Create New Disc"** or select from inventory
3. Choose disc set and enter substats
4. View disc scoring and quality rating

### Importing/Exporting Data

1. Go to **Data Manager** page
2. Click **"Export Builds & Discs"** to download your data
3. Use **"Import Builds & Discs"** to restore from backup
4. Option to merge with existing data or replace entirely

## Data Sources

This tool uses game data from:
- [Prydwen.gg](https://www.prydwen.gg/zenless/) - Character guides and analysis
- [Enka Network](https://enka.network) - API for validating disc scoring thresholds against real player data
- Official game assets and calculations

## Assumptions

To provide consistent calculations, this optimizer assumes:
- **All Discs**: S-Rank, upgraded to +15
- **All Agents**: Level 60 with Core Skill/Passive maxed
- **W-Engine Effects**: Best-case scenario conditions met

## Philosophy

This tool provides **estimates only** and is not indicative of your skill or the true quality of your builds. We intentionally do not enforce "optimal" W-Engines or disc sets because we believe in player creativity and experimentation.

**Skill expression is what makes ZZZ awesome!** Use this tool as a guide, but always play your way and have fun.

## Contributing

Contributions are welcome! Please reach out to me on twitter - [@Southofpaw](https://x.com/Southofpaw).
Would love any suggestions, improvements, or feedback.

## Disclaimer

This is a fan-made tool and is **not affiliated with or endorsed by HoYoverse**. All game assets and data belong to their respective owners.

## License

MIT License - See LICENSE file for details

## Acknowledgments

- **HoYoverse** - For creating Zenless Zone Zero
- **Prydwen.gg** - For community resources and guides
- **Enka Network** - For their API enabling data-driven disc scoring validation
- **ZZZ Community** - For support and feedback
- [**Fribbels HSR Optimizer**](https://fribbels.github.io/hsr-optimizer) - For the idea of doing this for ZZZ
