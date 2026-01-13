# ZZZ Optimizer

A comprehensive build optimizer and character builder for **Zenless Zone Zero** (ZZZ). Manage your agents, W-Engines, disc sets, and calculate optimal builds with real-time stat calculations and scoring.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Angular](https://img.shields.io/badge/Angular-19.2-red.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- **Character Build Management**: Create and manage multiple builds for your agents
- **Real-Time Stat Calculation**: Automatically calculates all stats including:
  - Base stats (HP, ATK, DEF)
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
  - Quality ratings (S+, S, A+, A, B, C, D)

- **Build Scoring & Optimization**:
  - Agent-specific scoring algorithms
  - Substat weight calculations
  - Main stat preference bonuses
  - Overall build ratings

- **Data Import/Export**:
  - Export your builds and disc inventory as JSON
  - Import builds from backup files
  - Merge or replace existing data

- **Persistent Storage**: All data stored locally in IndexedDB (no server required)

## Live Demo

Visit the live site: [https://southxpaw.github.io/zzz.optimizer/](https://southxpaw.github.io/zzz.optimizer/)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/SouthxPaw/zzz.optimizer.git
cd zzz.optimizer
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:4200/`

## Building

### Development Build
```bash
npm run build
```

### GitHub Pages Build
```bash
npm run build:ghpages
```

### Deploy to GitHub Pages
```bash
npm run deploy:ghpages
```

Build artifacts will be stored in the `dist/zzz.optimizer/` directory.

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

## Project Structure

```
src/
├── app/
│   ├── components/        # UI components
│   │   ├── character-tab/ # Main build manager
│   │   ├── data-manager/  # Import/export tools
│   │   ├── navigation/    # Top navigation
│   │   └── footer/        # Footer with version
│   ├── models/           # TypeScript interfaces
│   ├── services/         # Business logic
│   │   ├── agent.service.ts
│   │   ├── wengine.service.ts
│   │   ├── disc.service.ts
│   │   ├── build.service.ts
│   │   ├── stat-calculator.service.ts
│   │   └── scoring.service.ts
│   ├── constants/        # Game data and scoring weights
│   └── assets/           # Images and JSON data
```

## Data Sources

This tool uses game data from:
- [Prydwen.gg](https://www.prydwen.gg/zenless/) - Character guides and analysis
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

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This is a fan-made tool and is **not affiliated with or endorsed by HoYoverse**. All game assets and data belong to their respective owners.

## License

MIT License - See LICENSE file for details

## Acknowledgments

- **HoYoverse** - For creating Zenless Zone Zero
- **Prydwen.gg** - For community resources and guides
- **ZZZ Community** - For support and feedback
