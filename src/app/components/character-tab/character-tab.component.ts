import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Agent {
  id: string;
  name: string;
  rarity: number;
  element: 'Physical' | 'Fire' | 'Ice' | 'Electric' | 'Ether';
  specialty: 'Attack' | 'Stun' | 'Support' | 'Defense' | 'Anomaly';
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    impact: number;
    anomalyMastery: number;
    critRate: number;
    critDmg: number;
  };
}

interface WEngine {
  id: string;
  name: string;
  rarity: number;
  baseAtk: number;
  specialty: string;
}

@Component({
  selector: 'app-character-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './character-tab.component.html',
  styleUrls: ['./character-tab.component.css']
})
export class CharacterTabComponent implements OnInit {
  agents: Agent[] = [
    {
      id: 'ellen',
      name: 'Ellen Joe',
      rarity: 5,
      element: 'Ice',
      specialty: 'Attack',
      baseStats: {
        hp: 8367,
        atk: 3373,
        def: 686,
        impact: 96,
        anomalyMastery: 92,
        critRate: 5,
        critDmg: 50
      }
    },
    {
      id: 'zhu-yuan',
      name: 'Zhu Yuan',
      rarity: 5,
      element: 'Ether',
      specialty: 'Attack',
      baseStats: {
        hp: 7939,
        atk: 3496,
        def: 686,
        impact: 88,
        anomalyMastery: 92,
        critRate: 5,
        critDmg: 50
      }
    },
    {
      id: 'lycaon',
      name: 'Von Lycaon',
      rarity: 5,
      element: 'Ice',
      specialty: 'Stun',
      baseStats: {
        hp: 8272,
        atk: 2992,
        def: 762,
        impact: 120,
        anomalyMastery: 92,
        critRate: 5,
        critDmg: 50
      }
    },
    {
      id: 'nicole',
      name: 'Nicole',
      rarity: 4,
      element: 'Ether',
      specialty: 'Support',
      baseStats: {
        hp: 7315,
        atk: 2729,
        def: 686,
        impact: 88,
        anomalyMastery: 115,
        critRate: 5,
        critDmg: 50
      }
    }
  ];

  wEngines: WEngine[] = [
    { id: 'deep-sea', name: 'Deep Sea Visitor', rarity: 5, baseAtk: 713, specialty: 'Attack' },
    { id: 'steel-cushion', name: 'Steel Cushion', rarity: 5, baseAtk: 713, specialty: 'Stun' },
    { id: 'street-superstar', name: 'Street Superstar', rarity: 4, baseAtk: 594, specialty: 'Attack' },
    { id: 'starlight', name: 'Starlight Engine', rarity: 4, baseAtk: 594, specialty: 'Attack' }
  ];

  selectedAgent: Agent | null = null;
  selectedWEngine: WEngine | null = null;
  mindscapeLevel = 0;

  ngOnInit() {
    if (this.agents.length > 0) {
      this.selectAgent(this.agents[0]);
    }
  }

  selectAgent(agent: Agent) {
    this.selectedAgent = agent;
    this.mindscapeLevel = 0;
    this.selectedWEngine = null;
  }

  toggleMindscape(level: number) {
    this.mindscapeLevel =
      this.mindscapeLevel === level ? level - 1 : level;
  }
}
