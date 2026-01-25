// services/seo.service.ts
import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * SEO Service for managing structured data and meta tags
 */
@Injectable({
  providedIn: 'root'
})
export class SeoService {
  constructor(@Inject(DOCUMENT) private document: Document) {}

  /**
   * Add JSON-LD structured data to the page
   */
  addStructuredData(): void {
    // Check if already added
    if (this.document.getElementById('structured-data')) {
      return;
    }

    const script = this.document.createElement('script');
    script.id = 'structured-data';
    script.type = 'application/ld+json';

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      'name': "Southpaw's ZZZ Optimizer",
      'alternateName': 'Zenless Zone Zero Optimizer',
      'description': "Southpaw's free build optimizer and disc drive calculator for Zenless Zone Zero. Optimize character builds, calculate stats, and find the perfect disc combinations for your agents.",
      'url': 'https://southxpaw.github.io/zzz.optimizer/',
      'applicationCategory': 'GameApplication',
      'operatingSystem': 'Web Browser',
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD'
      },
      'creator': {
        '@type': 'Person',
        'name': 'Southpaw'
      },
      'keywords': [
        'zenless zone zero',
        'zzz',
        'optimizer',
        'disc drive',
        'build calculator',
        'character builds',
        'substats',
        'w-engine',
        'stat calculator'
      ],
      'featureList': [
        'Character build optimization',
        'Disc drive calculator',
        'Substat optimization',
        'W-Engine comparison',
        'Import builds from UID',
        'Stat calculator',
        'Offline support'
      ],
      'screenshot': 'https://southxpaw.github.io/zzz.optimizer/assets/data/images/page-icons/zzzicon.webp',
      'inLanguage': 'en-US',
      'isAccessibleForFree': true,
      'isFamilyFriendly': true
    };

    script.textContent = JSON.stringify(structuredData, null, 2);
    this.document.head.appendChild(script);
  }

  /**
   * Add breadcrumb structured data for navigation
   */
  addBreadcrumbs(items: Array<{ name: string; url: string }>): void {
    const breadcrumbScript = this.document.getElementById('breadcrumb-data');
    if (breadcrumbScript) {
      breadcrumbScript.remove();
    }

    const script = this.document.createElement('script');
    script.id = 'breadcrumb-data';
    script.type = 'application/ld+json';

    const breadcrumbData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': items.map((item, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': item.name,
        'item': item.url
      }))
    };

    script.textContent = JSON.stringify(breadcrumbData, null, 2);
    this.document.head.appendChild(script);
  }
}
