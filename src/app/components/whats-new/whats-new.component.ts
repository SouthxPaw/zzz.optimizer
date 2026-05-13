import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { versionedUrl } from '../../utils/versioned-url';
import { environment } from '../../../environments/environment';

interface ChangelogVersion {
  version: string;
  date: string;
  features: string[];
  fixes: string[];
  improvements: string[];
}

interface Changelog {
  versions: ChangelogVersion[];
}

@Component({
  selector: 'app-whats-new',
  imports: [CommonModule],
  templateUrl: './whats-new.component.html',
  styleUrl: './whats-new.component.css'
})
export class WhatsNewComponent implements OnInit {
  changelog: ChangelogVersion[] = [];
  loading = true;
  error = false;

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    try {
      const data = await firstValueFrom(
        this.http.get<Changelog>(versionedUrl('assets/data/changelog.json'))
      );
      this.changelog = data.versions;
      this.loading = false;

      // Mark that user has viewed the current app version
      // Use environment.appVersion to match what navigation checks against
      localStorage.setItem('last_viewed_version', environment.appVersion);
    } catch (err) {
      console.error('Failed to load changelog:', err);
      this.error = true;
      this.loading = false;
    }
  }

  /**
   * Check if a version has any content to display
   */
  hasContent(version: ChangelogVersion): boolean {
    return (
      version.features.length > 0 ||
      version.fixes.length > 0 ||
      version.improvements.length > 0
    );
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
