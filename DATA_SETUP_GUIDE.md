# ZZZ Optimizer - Data Setup Guide

## ✅ No Test Data - User Data Only!

All hardcoded test/mock data has been **completely removed**. The application now works like HSR Optimizer with IndexedDB caching.

---

## 📦 How Your Data is Structured

### Agent Data Format (agents.json)

Your `agents.json` contains raw game data with this structure:

```json
{
  "1011": {
    "code": "Anby",
    "rank": 3,
    "type": 2,
    "element": 203,
    "EN": "Anby",
    "Stats": {
      "HpMax": 603,        // Base HP at level 1
      "Attack": 95,        // Base ATK at level 1
      "Defence": 49,       // Base DEF at level 1
      "BreakStun": 118,    // Impact
      "ElementAbnormalPower": 94,  // Anomaly Mastery
      "ElementMystery": 93,        // Anomaly Proficiency
      "Crit": 500,         // Crit Rate (500 = 5%)
      "CritDamage": 5000,  // Crit Damage (5000 = 50%)
      "PenRate": 0,        // Penetration Ratio
      "SpRecover": 120     // Energy Regen (120 = 1.2)
    },
    "Level": {
      "6": {
        "HpMax": 2069,   // HP growth from level 1 to 60
        "Attack": 169,   // ATK growth
        "Defence": 169   // DEF growth
      }
    }
  }
}
```

### Mapping to App Format

The `DataTransformerService` converts raw data to:

| Raw Field | App Field | Conversion |
|-----------|-----------|------------|
| `Stats.HpMax` + `Level.6.HpMax` | `lvl60Stats.hp` | Direct sum |
| `Stats.Attack` + `Level.6.Attack` | `lvl60Stats.atk` | Direct sum |
| `Stats.Defence` + `Level.6.Defence` | `lvl60Stats.def` | Direct sum |
| `Stats.BreakStun` | `lvl60Stats.impact` | Direct |
| `Stats.ElementAbnormalPower` | `lvl60Stats.anomalyMastery` | Direct |
| `Stats.ElementMystery` | `lvl60Stats.anomalyProficiency` | Direct |
| `Stats.Crit` | `lvl60Stats.critRate` | ÷ 100 (500 → 5%) |
| `Stats.CritDamage` | `lvl60Stats.critDmg` | ÷ 100 (5000 → 50%) |
| `Stats.PenRate` | `lvl60Stats.penRatio` | ÷ 100 |
| `Stats.SpRecover` | `lvl60Stats.energyRegen` | ÷ 100 (120 → 1.2) |

### Element Mapping

| Code | Element |
|------|---------|
| 200 | Physical |
| 201 | Fire |
| 202 | Ice |
| 203 | Electric |
| 205 | Ether |

### Specialty Mapping (Type)

| Code | Specialty |
|------|-----------|
| 1 | Attack |
| 2 | Stun |
| 3 | Anomaly |
| 4 | Support |
| 5 | Defense |
| 6 | Anomaly |

### Rarity Mapping

| Rank | Rarity |
|------|--------|
| 3 | A-Rank |
| 4+ | S-Rank |

---

## 🚀 How to Import Your Data

### Option 1: Using the Data Manager UI

1. Start your app: `npm start`
2. Navigate to the Data Manager component
3. Click "Import All Data" to load from `assets/data/`

### Option 2: Using the Character Tab

1. Go to the Character Tab
2. Click "Import Agents" button
3. Either:
   - Paste JSON directly into the modal
   - Use "Upload JSON" to select a file

### Option 3: Programmatically

```typescript
import { DataImportService } from './services/data-import.service';

// In your component
constructor(private dataImport: DataImportService) {}

async ngOnInit() {
  // Import all data from assets folder
  const results = await this.dataImport.importAllData();
  console.log(`Imported: ${results.agents} agents, ${results.wEngines} W-Engines`);
}
```

---

## 💾 IndexedDB Storage

All data is stored in your browser's IndexedDB cache (like HSR Optimizer):

- **Database Name**: `ZZZOptimizerDB`
- **Tables**:
  - `agents` - All imported agents
  - `wEngines` - All imported W-Engines
  - `discs` - All disc drives

### Viewing Your Data

Open Chrome DevTools → Application → IndexedDB → ZZZOptimizerDB

---

## 📝 Example: Final Level 60 Stats Calculation

**For Anby (from your data):**

```
Base Stats (Level 1):
- HP: 603
- ATK: 95
- DEF: 49

Growth (Level 6):
- HP: +2069
- ATK: +169
- DEF: +169

Final Level 60 Stats:
- HP: 603 + 2069 = 2672
- ATK: 95 + 169 = 264
- DEF: 49 + 169 = 218
- Impact: 118
- Anomaly Mastery: 94
- Anomaly Proficiency: 93
- Crit Rate: 5%
- Crit DMG: 50%
- Pen Ratio: 0%
- Energy Regen: 1.2
```

---

## 🔧 Services Overview

### DbService
- Direct IndexedDB operations using Dexie
- CRUD methods for all data types
- Located: `src/app/services/db.service.ts`

### DataTransformerService
- Transforms raw game JSON to app format
- Handles all stat conversions
- Located: `src/app/services/data-transformer.service.ts`

### DataImportService
- Bulk import/export functionality
- File and JSON string handling
- Located: `src/app/services/data-import.service.ts`

### AgentService
- Agent management and selection
- Loads from IndexedDB
- Observable streams for reactive updates
- Located: `src/app/services/agent.service.ts`

### WEngineService
- W-Engine management
- Loads from IndexedDB
- Located: `src/app/services/wengine.service.ts`

---

## 📂 File Structure

```
src/
├── assets/
│   └── data/
│       ├── agents.json      ← Your raw agent data
│       ├── wengines.json    ← Your raw W-Engine data
│       └── discs.json       ← Your raw disc data
├── app/
│   ├── models/
│   │   ├── agent.model.ts
│   │   ├── wengine.model.ts
│   │   └── disc.model.ts
│   ├── services/
│   │   ├── db.service.ts
│   │   ├── data-transformer.service.ts
│   │   ├── data-import.service.ts
│   │   ├── agent.service.ts
│   │   └── wengine.service.ts
│   └── components/
│       ├── character-tab/
│       └── data-manager/
```

---

## ✨ Features

### Character Tab
- ✅ Empty state when no data
- ✅ Import modal (paste JSON or upload file)
- ✅ Delete individual agents
- ✅ Agent selection
- ✅ Mindscape level selection
- ✅ W-Engine selection
- ✅ Stat display

### Data Manager
- ✅ Bulk import from assets folder
- ✅ Individual import (agents/wengines/discs)
- ✅ Export to JSON
- ✅ Clear all data

---

## 🎯 Next Steps

1. **Place your data files** in `src/assets/data/`
2. **Run the app**: `npm start`
3. **Import your data** using the Data Manager or Character Tab
4. **Start building optimized agent loadouts!**

---

## 🐛 Troubleshooting

### "No agents found"
- Check that `agents.json` is in `src/assets/data/`
- Verify the JSON format matches the structure above
- Check browser console for transformation errors

### Stats look wrong
- Verify the `Stats` field exists in your agent data
- Check that `Level.6` exists for level 60 calculations
- See console logs for transformation warnings

### Import fails
- Check JSON syntax is valid
- Ensure all required fields are present (`EN`, `element`, `type`, `Stats`)
- Look at console for specific error messages

---

## 📚 Additional Resources

- **Dexie.js Documentation**: https://dexie.org/
- **Angular Signals**: https://angular.io/guide/signals
- **IndexedDB Guide**: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

---

**All test data removed ✓**
**IndexedDB caching like HSR Optimizer ✓**
**Ready for your real game data ✓**
