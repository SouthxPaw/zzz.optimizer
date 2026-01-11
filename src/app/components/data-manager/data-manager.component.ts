import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataImportService } from '../../services/data-import.service';
import { AppInitService } from '../../services/app-init.service';

@Component({
  selector: 'app-data-manager',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './data-manager.component.html',
  styleUrls: ['./data-manager.component.css']
})
export class DataManagerComponent {
  isLoading = false;
  message = '';
  messageType: 'success' | 'error' | 'info' = 'info';

  constructor(
    private dataImportService: DataImportService,
    private appInitService: AppInitService
  ) {}

  async reloadReferenceData() {
    if (confirm('This will reload all reference data (agents, W-Engines) from assets. Continue?')) {
      this.isLoading = true;
      this.setMessage('Reloading reference data from assets folder...', 'info');

      try {
        await this.appInitService.reloadReferenceData();
        this.setMessage('Reference data reloaded successfully', 'success');
      } catch (error) {
        console.error('Reload error:', error);
        this.setMessage('Error reloading reference data. Check console for details.', 'error');
      } finally {
        this.isLoading = false;
      }
    }
  }

  async importAllFromAssets() {
    this.isLoading = true;
    this.setMessage('Importing all data from assets folder...', 'info');

    try {
      const results = await this.dataImportService.importAllData();
      const total = results.agents + results.wEngines + results.discs;

      if (total === 0) {
        this.setMessage('No data files found in assets folder', 'error');
      } else {
        this.setMessage(
          `Successfully imported: ${results.agents} agents, ${results.wEngines} W-Engines, ${results.discs} discs`,
          'success'
        );
      }
    } catch (error) {
      console.error('Import error:', error);
      this.setMessage('Error importing data. Check console for details.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async importAgentsFromAssets() {
    this.isLoading = true;
    this.setMessage('Importing agents...', 'info');

    try {
      const count = await this.dataImportService.importAgentsFromFile();
      this.setMessage(`Successfully imported ${count} agents`, 'success');
    } catch (error) {
      console.error('Import error:', error);
      this.setMessage('Error importing agents. Check console for details.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async importWEnginesFromAssets() {
    this.isLoading = true;
    this.setMessage('Importing W-Engines...', 'info');

    try {
      const count = await this.dataImportService.importWEnginesFromFile();
      this.setMessage(`Successfully imported ${count} W-Engines`, 'success');
    } catch (error) {
      console.error('Import error:', error);
      this.setMessage('Error importing W-Engines. Check console for details.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async importDiscsFromAssets() {
    this.isLoading = true;
    this.setMessage('Importing discs...', 'info');

    try {
      const count = await this.dataImportService.importDiscsFromFile();
      this.setMessage(`Successfully imported ${count} discs`, 'success');
    } catch (error) {
      console.error('Import error:', error);
      this.setMessage('Error importing discs. Check console for details.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async exportAllData() {
    this.isLoading = true;
    this.setMessage('Exporting data...', 'info');

    try {
      const jsonData = await this.dataImportService.exportAllData();
      this.downloadJSON(jsonData, 'zzz-optimizer-data.json');
      this.setMessage('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.setMessage('Error exporting data. Check console for details.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async exportAgents() {
    try {
      const jsonData = await this.dataImportService.exportAgents();
      this.downloadJSON(jsonData, 'agents.json');
      this.setMessage('Agents exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.setMessage('Error exporting agents', 'error');
    }
  }

  async exportWEngines() {
    try {
      const jsonData = await this.dataImportService.exportWEngines();
      this.downloadJSON(jsonData, 'wengines.json');
      this.setMessage('W-Engines exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.setMessage('Error exporting W-Engines', 'error');
    }
  }

  async exportDiscs() {
    try {
      const jsonData = await this.dataImportService.exportDiscs();
      this.downloadJSON(jsonData, 'discs.json');
      this.setMessage('Discs exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.setMessage('Error exporting discs', 'error');
    }
  }

  async clearUserData() {
    if (confirm('Are you sure you want to delete your user data (disc inventory)? This cannot be undone!')) {
      this.isLoading = true;
      this.setMessage('Clearing user data...', 'info');

      try {
        await this.dataImportService.clearUserData();
        this.setMessage('User data cleared successfully', 'success');
      } catch (error) {
        console.error('Clear error:', error);
        this.setMessage('Error clearing user data. Check console for details.', 'error');
      } finally {
        this.isLoading = false;
      }
    }
  }

  async clearReferenceData() {
    if (confirm('Are you sure you want to delete reference data (agents, W-Engines)? You can re-import it from assets.')) {
      this.isLoading = true;
      this.setMessage('Clearing reference data...', 'info');

      try {
        await this.dataImportService.clearReferenceData();
        this.setMessage('Reference data cleared successfully', 'success');
      } catch (error) {
        console.error('Clear error:', error);
        this.setMessage('Error clearing reference data. Check console for details.', 'error');
      } finally {
        this.isLoading = false;
      }
    }
  }

  async clearAllData() {
    if (confirm('Are you sure you want to delete ALL data (both reference and user data)? This cannot be undone!')) {
      this.isLoading = true;
      this.setMessage('Clearing all data...', 'info');

      try {
        await this.dataImportService.clearAllData();
        this.setMessage('All data cleared successfully', 'success');
      } catch (error) {
        console.error('Clear error:', error);
        this.setMessage('Error clearing data. Check console for details.', 'error');
      } finally {
        this.isLoading = false;
      }
    }
  }

  private downloadJSON(jsonString: string, filename: string) {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private setMessage(message: string, type: 'success' | 'error' | 'info') {
    this.message = message;
    this.messageType = type;
  }
}
