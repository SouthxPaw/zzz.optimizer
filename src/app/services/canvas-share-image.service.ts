import { Injectable } from '@angular/core';
import { AgentBuild } from './build.service';
import { Agent, DiscSlot } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { DiscSet } from './disc-set.service';
import { Disc } from '../models/disc.model';
import { BuildRating, DiscRating } from '../constants/disc-scoring';

export interface ShareImageData {
  build: AgentBuild;
  agent: Agent;
  buildScore: { score: number; rating: BuildRating } | null;
  discScores: Map<string, { score: number; rating: DiscRating }>;
  mainStats: Array<{ iconName: string; label: string; value: string }>;
  wEngineStats: Array<{ iconName: string; label: string; value: string }>;
  discSets: DiscSet[];
  substatBreakdown: Array<{
    name: string;
    value: string;
    isPercent: boolean;
    rollCount: number;
    isPriority: boolean;
  }>;
  showBuildRating?: boolean;
  showDiscRatings?: boolean;
  customAgentImageUrl?: string;
  customBackgroundImageUrl?: string;
  customBarImageUrl?: string;
  accentColor?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CanvasShareImageService {
  // Canvas dimensions
  private readonly WIDTH = 1180;
  private readonly HEIGHT = 630;
  private readonly SCALE = 3; // 3x resolution for high quality

  // Image cache to avoid reloading
  private imageCache = new Map<string, HTMLImageElement>();

  constructor() {}

  /**
   * Main entry point: Generate share image as PNG blob
   */
  async generateShareImage(data: ShareImageData): Promise<Blob> {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = this.WIDTH * this.SCALE;
    canvas.height = this.HEIGHT * this.SCALE;
    const ctx = canvas.getContext('2d')!;

    // Scale context for high-resolution rendering
    ctx.scale(this.SCALE, this.SCALE);

    // Enable high-quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw all layers in order
    await this.drawBackground(ctx, data);
    await this.drawAngledBar(ctx, data);
    await this.drawAgentSection(ctx, data);
    await this.drawEquipmentSection(ctx, data);
    await this.drawFooter(ctx, data);

    // Ensure all rendering is complete before converting to blob
    // This fixes Firefox-specific timing issues where canvas may not be fully rendered
    await new Promise(resolve => requestAnimationFrame(resolve));

    // TEST: Check if canvas has actual content by sampling a pixel
    try {
      const testPixel = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
    } catch (err) {
      console.error('[Canvas] Canvas may be tainted (CORS issue):', err);
    }

    // Convert canvas to blob with fallback handling
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          // Check if blob was created successfully AND has content
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            // Fallback to dataURL method if blob is empty or null
            // This handles Firefox privacy settings and edge cases
            console.warn('[Canvas] ⚠️ Blob empty or null, using dataURL fallback');
            try {
              const dataUrl = canvas.toDataURL('image/png', 1.0);
              const blobFromDataUrl = this.dataURLToBlob(dataUrl);
              resolve(blobFromDataUrl);
            } catch (err) {
              console.error('[Canvas] ❌ Failed to create blob via both methods:', err);
              console.error('[Canvas] Error name:', (err as Error).name);
              console.error('[Canvas] Error message:', (err as Error).message);
              console.error('[Canvas] Canvas size:', canvas.width, 'x', canvas.height);
              console.error('[Canvas] Image cache size:', this.imageCache.size);
              reject(new Error('Failed to generate image blob: ' + (err as Error).message));
            }
          }
        },
        'image/png',
        1.0,
      );
    });
  }

  /**
   * Convert dataURL to Blob (fallback method for browsers with canvas restrictions)
   */
  private dataURLToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const binaryString = atob(parts[1]);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }

  /**
   * Load image with caching
   */
  private async loadImage(src: string): Promise<HTMLImageElement> {
    // Check cache first
    if (this.imageCache.has(src)) {
      return this.imageCache.get(src)!;
    }

    // Load image
    return new Promise((resolve, reject) => {
      const img = new Image();

      // Only set crossOrigin for external URLs, not for local assets
      // This prevents canvas tainting in Firefox
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        this.imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = (error) => {
        console.error('[Canvas] ❌ Failed to load image:', src, error);
        reject(new Error(`Failed to load image: ${src}`));
      };
      img.src = src;
    });
  }

  /**
   * Draw background layer (ZZZTV.jpg with brightness filter or custom image)
   */
  private async drawBackground(ctx: CanvasRenderingContext2D, data: ShareImageData): Promise<void> {
    // Fill with base color
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    // Use custom background image if provided, otherwise use default
    const backgroundImageUrl = data.customBackgroundImageUrl || 'assets/data/images/share-image/ZZZTV.jpg';

    // Draw background image with aspect ratio maintained (cover mode)
    try {
      const bgImage = await this.loadImage(backgroundImageUrl);

      // Calculate dimensions to cover the canvas while maintaining aspect ratio
      const imgRatio = bgImage.width / bgImage.height;
      const canvasRatio = this.WIDTH / this.HEIGHT;

      let drawWidth, drawHeight, drawX, drawY;

      if (imgRatio > canvasRatio) {
        // Image is wider than canvas - fit to height
        drawHeight = this.HEIGHT;
        drawWidth = drawHeight * imgRatio;
        drawX = (this.WIDTH - drawWidth) / 2; // Center horizontally
        drawY = 0;
      } else {
        // Image is taller than canvas - fit to width
        drawWidth = this.WIDTH;
        drawHeight = drawWidth / imgRatio;
        drawX = 0;
        drawY = (this.HEIGHT - drawHeight) / 2; // Center vertically
      }

      // Apply brightness filter (0.6)
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();
    } catch (error) {
      console.warn('[Canvas] ⚠️ Background image failed to load, using solid color:', error);
    }
  }

  /**
   * Draw angled grey bar with accent-colored borders (or custom image)
   */
  private async drawAngledBar(ctx: CanvasRenderingContext2D, data: ShareImageData): Promise<void> {
    const accentColor = data.accentColor || '#f4b942';

    ctx.save();

    // Move to position and rotate
    ctx.translate(this.WIDTH - 705 + 500, -500 + 750); // right: -300, top: -500 + center of bar
    ctx.rotate((-30 * Math.PI) / 180);

    // Create clipping path for the bar area
    ctx.beginPath();
    ctx.rect(-500, -750, 1000, 1500);
    ctx.clip();

    // Draw shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // If custom bar image is provided, use it instead of the default grey bar
    if (data.customBarImageUrl) {
      try {
        const barImg = await this.loadImage(data.customBarImageUrl);

        // Calculate dimensions to cover the bar area while maintaining aspect ratio
        const barWidth = 1000;
        const barHeight = 1500;
        const imgRatio = barImg.width / barImg.height;
        const barRatio = barWidth / barHeight;

        let drawWidth, drawHeight, drawX, drawY;

        if (imgRatio > barRatio) {
          // Image is wider than bar - fit to height
          drawHeight = barHeight;
          drawWidth = drawHeight * imgRatio;
          drawX = -500 - (drawWidth - barWidth) / 2; // Center horizontally
          drawY = -750;
        } else {
          // Image is taller than bar - fit to width
          drawWidth = barWidth;
          drawHeight = drawWidth / imgRatio;
          drawX = -500;
          drawY = -750 - (drawHeight - barHeight) / 2; // Center vertically
        }

        // Draw the custom image to cover the bar area (maintains aspect ratio)
        ctx.drawImage(barImg, drawX, drawY, drawWidth, drawHeight);
      } catch (error) {
        console.warn('[Canvas] ⚠️ Custom bar image failed to load, using default:', error);
        // Fallback to default grey bar
        ctx.fillStyle = '#444444';
        ctx.fillRect(-500, -750, 1000, 1500);
      }
    } else {
      // Draw default bar background
      ctx.fillStyle = '#444444';
      ctx.fillRect(-500, -750, 1000, 1500);
    }

    // Restore context to remove clipping before drawing border
    ctx.restore();

    // Draw the border outside of the clipping region
    ctx.save();
    ctx.translate(this.WIDTH - 705 + 500, -500 + 750);
    ctx.rotate((-30 * Math.PI) / 180);

    // Draw accent-colored border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(-500, -750, 1000, 1500);

    ctx.restore();
  }

  /**
   * Draw agent section (left side)
   */
  private async drawAgentSection(
    ctx: CanvasRenderingContext2D,
    data: ShareImageData,
  ): Promise<void> {
    const accentColor = data.accentColor || '#f4b942';

    // Draw agent image (use custom image if provided, otherwise use default)
    const agentImageUrl = data.customAgentImageUrl || data.agent.icon;

    if (agentImageUrl) {
      try {
        const agentImg = await this.loadImage(agentImageUrl);

        ctx.save();

        // Calculate dimensions to maintain aspect ratio
        const agentHeight = this.HEIGHT;
        const agentWidth = (agentImg.width / agentImg.height) * agentHeight;

        // Position: left: 50%, transform: translateX(-40%) translateY(80px)
        const x = 350 / 2 - agentWidth * 0.4;
        const y = 80;

        ctx.drawImage(agentImg, x, y, agentWidth, agentHeight);
        ctx.restore();
      } catch (error) {
        console.warn('[Canvas] ⚠️ Agent image failed to load:', data.agent.name, error);
      }
    } else {
      console.warn('[Canvas] ⚠️ No agent icon available');
    }

    // Draw build rating container (top-left) - only if showBuildRating is true
    if (data.showBuildRating !== false) {
      const ratingX = 30 + 15; // padding + margin-left
      const ratingY = 10 + 10; // padding + margin-top

      // Draw rating label
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.beginPath();
      this.roundRect(ctx, ratingX, ratingY, 200, 24, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Arial';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(100, 100, 100, 0.9)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      const scoreText = `BUILD RATING: ${data.buildScore?.score || 'N/A'}%`;
      ctx.fillText(scoreText, ratingX + 12, ratingY + 4);
      ctx.restore();

      // Draw rating badge
      if (data.buildScore) {
        const badgeY = ratingY + 24 + 8; // gap of 8px
        const grade = data.buildScore.rating.grade;
        const badgeWidth = this.measureTextWidth(ctx, grade, 'bold 28px Arial') + 90;

        ctx.save();

        // Draw badge background with color or gradient
        const badgeColor = this.createBuildRatingGradient(
          ctx,
          grade,
          ratingX,
          badgeY,
          badgeWidth,
          48,
        );
        ctx.fillStyle = badgeColor;
        this.roundRect(ctx, ratingX, badgeY, badgeWidth, 48, 8);
        ctx.fill();

        // Draw accent-colored border
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 3;
        this.roundRect(ctx, ratingX, badgeY, badgeWidth, 48, 8);
        ctx.stroke();

        // Draw grade text
        ctx.fillStyle = '#0a0a0a';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(grade, ratingX + badgeWidth / 2, badgeY + 24);

        ctx.restore();
      }
    }

    // Draw agent info (bottom of agent section)
    const infoX = 20;
    const infoY = this.HEIGHT - 150 - 30; // padding-bottom: 105px, bottom padding: 30px

    // Draw agent name
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 42px Arial';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(data.agent.name, infoX, infoY);

    // Add accent-colored glow
    ctx.shadowColor = this.hexToRgba(accentColor, 0.5);
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(data.agent.name, infoX, infoY);
    ctx.restore();

    // Draw mindscape level if > 0
    let iconY = infoY + 10;
    if (data.build.mindscapeLevel > 0) {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px Arial';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(`M${data.build.mindscapeLevel}`, infoX, iconY);
      ctx.restore();

      iconY += 38; // 28px font + 10px gap
    }

    // Draw element and role icons
    if (data.agent.elementIcon || data.agent.specialElementIcon) {
      try {
        const elementIconPath = data.agent.specialElementIcon
          ? this.getElementIconPath(data.agent.specialElementIcon)
          : data.agent.elementIcon;

        if (elementIconPath) {
          const elementImg = await this.loadImage(elementIconPath);

          // Draw circle background and border
          ctx.save();
          ctx.fillStyle = 'transparent';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 4;

          ctx.beginPath();
          ctx.arc(infoX + 25, iconY + 25, 25, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fill();

          // Clip to circle and draw image
          ctx.clip();
          ctx.drawImage(elementImg, infoX + 5, iconY + 5, 40, 40);
          ctx.restore();
        } else {
          console.warn('[Canvas] Element icon path is empty');
        }
      } catch (error) {
        console.error('[Canvas] Element icon failed to load:', error);
      }
    } else {
      console.warn('[Canvas] No element icon data available');
    }

    if (data.agent.specialty) {
      try {
        const roleIconPath = this.getSpecialtyIcon(data.agent.specialty);
        const roleImg = await this.loadImage(roleIconPath);

        const roleX = infoX + 62; // 50px icon + 12px gap

        // Draw circle background and border
        ctx.save();
        ctx.fillStyle = 'transparent';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;

        ctx.beginPath();
        ctx.arc(roleX + 25, iconY + 25, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();

        // Clip to circle and draw image
        ctx.clip();
        ctx.drawImage(roleImg, roleX + 5, iconY + 5, 40, 40);
        ctx.restore();
      } catch (error) {
        console.warn('Role icon failed to load');
      }
    }
  }

  /**
   * Draw equipment section (right side)
   */
  private async drawEquipmentSection(
    ctx: CanvasRenderingContext2D,
    data: ShareImageData,
  ): Promise<void> {
    const sectionX = 350;
    const sectionY = 0;

    // Draw stats bar
    await this.drawStatsBar(ctx, sectionX + 20, sectionY + 20, data);

    // Draw W-Engine header if equipped
    if (data.build.equippedWEngine) {
      await this.drawWEngineHeader(
        ctx,
        sectionX + 20,
        sectionY + 90,
        data,
      );
    }

    // Draw equipment menu background image (below W-Engine header)
    try {
      const menuImg = await this.loadImage(
        'assets/data/images/share-image/Equipment_Menu_Screen.webp',
      );

      // Position: top: 150px, left: 55%, transform: translateX(-50%)
      const menuCenterX = sectionX + (this.WIDTH - sectionX) * 0.55;
      const menuY = 150;
      const menuWidth = 500;
      const menuHeight = 400;
      const menuX = menuCenterX - menuWidth / 2;

      ctx.save();
      ctx.globalAlpha = 1.0; // Fully opaque
      ctx.drawImage(menuImg, menuX, menuY, menuWidth, menuHeight);
      ctx.restore();
    } catch (error) {
      console.warn('[Canvas] ⚠️ Equipment menu background failed to load, using solid color fallback:', error);
      // Fallback to solid color
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const menuX = sectionX + (this.WIDTH - sectionX) * 0.55 - 400 / 2;
      const menuY = 150;
      this.roundRect(ctx, menuX, menuY, 400, 450, 12);
      ctx.fill();
      ctx.restore();
    }

    // Draw disc grid
    await this.drawDiscGrid(ctx, data);

    // Draw center W-Engine image
    if (data.build.equippedWEngine) {
      await this.drawWEngineCenter(ctx, data);
    }
  }

  /**
   * Draw stats bar (10 stats in 5x2 grid)
   */
  private async drawStatsBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    data: ShareImageData,
  ): Promise<void> {
    const accentColor = data.accentColor || '#f4b942';

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(26, 26, 26, 0.9)';
    this.roundRect(ctx, x, y, this.WIDTH - 350 - 40, 60, 8);
    ctx.fill();

    // Draw stats in grid (5 columns x 2 rows)
    const stats = data.mainStats;
    const colWidth = (this.WIDTH - 350 - 40) / 5;
    const rowHeight = 30;

    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i];
      const col = i % 5;
      const row = Math.floor(i / 5);
      const statX = x + 10 + col * colWidth;
      const statY = y + 8 + row * rowHeight;

      // Draw stat icon
      try {
        const iconImg = await this.loadImage(
          `assets/data/images/share-image/Icon_Stat_${stat.iconName}.webp`,
        );
        ctx.drawImage(iconImg, statX, statY, 18, 18);
      } catch (error) {
        console.warn(`Stat icon failed to load: ${stat.iconName}`);
      }

      // Draw stat label
      ctx.fillStyle = accentColor;
      ctx.font = '600 10px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText(stat.label + ':', statX + 21, statY + 4);

      // Draw stat value
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      const labelWidth = this.measureTextWidth(
        ctx,
        stat.label + ':',
        '600 10px Arial',
      );
      ctx.fillText(stat.value, statX + 21 + labelWidth + 3, statY + 3);
    }

    ctx.restore();
  }

  /**
   * Draw W-Engine header bar
   */
  private async drawWEngineHeader(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    data: ShareImageData,
  ): Promise<void> {
    if (!data.build.equippedWEngine) return;

    const accentColor = data.accentColor || '#f4b942';

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(26, 26, 26, 0.9)';
    this.roundRect(ctx, x, y, this.WIDTH - 350 - 40, 40, 8);
    ctx.fill();

    // Accent-colored border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, this.WIDTH - 350 - 40, 40);
    ctx.stroke();

    // W-Engine name
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 18px Arial';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.build.equippedWEngine.name, x + 12, y + 20);

    // W-Engine stats (right side)
    let statsX = x + this.WIDTH - 350 - 40 - 12;

    // Refinement badge
    const refinementText = `R${data.build.wEngineRefinement}`;
    const badgeWidth = this.measureTextWidth(ctx, refinementText, 'bold 13px Arial') + 20;

    ctx.fillStyle = this.hexToRgba(accentColor, 0.2);
    this.roundRect(ctx, statsX - badgeWidth, y + 10, badgeWidth, 20, 4);
    ctx.fill();

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    this.roundRect(ctx, statsX - badgeWidth, y + 10, badgeWidth, 20, 4);
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(refinementText, statsX - badgeWidth / 2, y + 20);

    statsX -= badgeWidth + 12;

    // W-Engine stats (inline, right to left)
    ctx.textAlign = 'right';
    for (let i = data.wEngineStats.length - 1; i >= 0; i--) {
      const stat = data.wEngineStats[i];

      // Draw stat value
      ctx.fillStyle = '#fff';
      ctx.font = '500 13px Arial';
      ctx.fillText(stat.value, statsX, y + 20);
      const valueWidth = this.measureTextWidth(ctx, stat.value, '500 13px Arial');
      statsX -= valueWidth + 5;

      // Draw stat label
      ctx.fillText(stat.label + ':', statsX, y + 20);
      const labelWidth = this.measureTextWidth(
        ctx,
        stat.label + ':',
        '500 13px Arial',
      );
      statsX -= labelWidth + 5;

      // Draw stat icon
      try {
        const iconImg = await this.loadImage(
          `assets/data/images/share-image/Icon_Stat_${stat.iconName}.webp`,
        );
        ctx.drawImage(iconImg, statsX - 16, y + 12, 16, 16);
        statsX -= 16 + 12;
      } catch (error) {
        console.warn(`W-Engine stat icon failed to load: ${stat.iconName}`);
      }
    }

    ctx.restore();
  }

  /**
   * Draw disc equipment grid (6 discs positioned around center W-Engine)
   */
  private async drawDiscGrid(
    ctx: CanvasRenderingContext2D,
    data: ShareImageData,
  ): Promise<void> {
    const gridX = this.WIDTH * 0.58 - 390; // left: 58%, transform: translateX(-50%) = -390px
    const gridY = 170;

    // Disc positions (from CSS)
    const discPositions: Record<
      DiscSlot,
      {
        statsX: number;
        statsY: number;
        imageX: number;
        imageY: number;
        imageFirst: boolean;
      }
    > = {
      Drive1: {
        statsX: gridX + 205,
        statsY: gridY,
        imageX: gridX + 359,
        imageY: gridY + 5 - 3,
        imageFirst: false,
      },
      Drive2: {
        statsX: gridX + 148,
        statsY: gridY + 140 - 8,
        imageX: gridX + 292,
        imageY: gridY + 131 + 1,
        imageFirst: false,
      },
      Drive3: {
        statsX: gridX + 205,
        statsY: gridY + 270 + 4,
        imageX: gridX + 359,
        imageY: gridY + 256 + 5,
        imageFirst: false,
      },
      Drive4: {
        statsX: gridX + 940 - 50 - 180,
        statsY: gridY + 250 + 30,
        imageX: gridX + 945 - 50 - 327,
        imageY: gridY + 246 + 16,
        imageFirst: true,
      },
      Drive5: {
        statsX: gridX + 940 - 50 - 125,
        statsY: gridY + 125 + 10,
        imageX: gridX + 953 - 50 - 266,
        imageY: gridY + 122 + 10,
        imageFirst: true,
      },
      Drive6: {
        statsX: gridX + 940 - 50 - 180,
        statsY: gridY - 5,
        imageX: gridX + 946 - 50 - 327,
        imageY: gridY - 5 + 8,
        imageFirst: true,
      },
    };

    // Draw each disc
    const slots: DiscSlot[] = [
      'Drive1',
      'Drive2',
      'Drive3',
      'Drive4',
      'Drive5',
      'Drive6',
    ];

    for (const slot of slots) {
      const disc = data.build.equippedDiscs[slot];
      if (!disc) continue;

      const pos = discPositions[slot];
      const discScore = data.discScores.get(disc.uid);

      await this.drawDisc(ctx, disc, discScore, pos.statsX, pos.statsY, data.showDiscRatings, data.accentColor);
      await this.drawDiscImage(
        ctx,
        disc,
        data.discSets,
        pos.imageX,
        pos.imageY,
      );
    }
  }

  /**
   * Draw individual disc stats card
   */
  private async drawDisc(
    ctx: CanvasRenderingContext2D,
    disc: Disc,
    discScore: { score: number; rating: DiscRating } | undefined,
    x: number,
    y: number,
    showDiscRatings?: boolean,
    accentColor?: string,
  ): Promise<void> {
    const color = accentColor || '#f4b942';

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(26, 26, 26, 1)';
    this.roundRect(ctx, x, y, 110, 85, 6);
    ctx.fill();

    // Accent-colored border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, 110, 85, 6);
    ctx.stroke();

    // Rating badge - only if showDiscRatings is true
    if (discScore && showDiscRatings !== false) {
      const grade = discScore.rating.grade;
      const badgeWidth = this.measureTextWidth(ctx, grade, 'bold 12px Arial') + 20;
      const badgeX = x + 55 - badgeWidth / 2;
      const badgeY = y + 3;

      // Use gradient for VH/PHT, solid color for others
      const badgeColor = this.createDiscRatingGradient(
        ctx,
        grade,
        badgeX,
        badgeY,
        badgeWidth,
        18,
      );
      ctx.fillStyle = badgeColor;
      this.roundRect(ctx, badgeX, badgeY, badgeWidth, 18, 4);
      ctx.fill();

      ctx.fillStyle = '#0a0a0a';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(grade, badgeX + badgeWidth / 2, badgeY + 9);
    }

    // Main stat
    let textY = y + 24;

    // Main stat type (left-aligned)
    ctx.fillStyle = color;
    ctx.font = '500 9px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const mainStatType = this.formatStatType(disc.mainStat.type);
    ctx.fillText(mainStatType, x + 5, textY);

    // Main stat value (right-aligned)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(String(disc.mainStat.value), x + 105, textY);

    // Divider line
    textY += 12;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 5, textY);
    ctx.lineTo(x + 105, textY);
    ctx.stroke();

    // Substats
    textY += 4;
    for (const subStat of disc.subStats) {
      ctx.fillStyle = '#aaa';
      ctx.font = '300 8px Arial';
      ctx.textAlign = 'left';

      let subText = this.formatStatType(subStat.type);
      if (subStat.rolls && subStat.rolls > 1) {
        // Add roll count
        ctx.fillText(subText, x + 5, textY);
        const subTypeWidth = this.measureTextWidth(ctx, subText, '300 8px Arial');

        ctx.fillStyle = '#00d9ff';
        ctx.font = 'bold 8px Arial';
        ctx.fillText(` +${subStat.rolls - 1}`, x + 5 + subTypeWidth, textY);

        const rollWidth = this.measureTextWidth(
          ctx,
          ` +${subStat.rolls - 1}`,
          'bold 8px Arial',
        );

        ctx.fillStyle = '#fff';
        ctx.font = '500 8px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(String(subStat.value), x + 105, textY);
      } else {
        ctx.fillText(subText, x + 5, textY);

        ctx.fillStyle = '#fff';
        ctx.font = '500 8px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(String(subStat.value), x + 105, textY);
      }

      textY += 10;
    }

    ctx.restore();
  }

  /**
   * Draw disc set icon image
   */
  private async drawDiscImage(
    ctx: CanvasRenderingContext2D,
    disc: Disc,
    discSets: DiscSet[],
    x: number,
    y: number,
  ): Promise<void> {
    const discSet = discSets.find((s) => s.name === disc.set);
    if (!discSet?.icon) return;

    try {
      const iconImg = await this.loadImage(this.getAbsoluteUrl(discSet.icon));

      ctx.save();

      // Draw semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      this.roundRect(ctx, x, y, 96, 96, 45);
      ctx.fill();

      // Draw white border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      this.roundRect(ctx, x, y, 96, 96, 45);
      ctx.stroke();

      // Draw icon with glow
      ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
      ctx.shadowBlur = 8;
      ctx.drawImage(iconImg, x + 3, y + 3, 90, 90);

      ctx.restore();
    } catch (error) {
      console.warn('Disc set icon failed to load:', discSet.icon);
    }
  }

  /**
   * Draw center W-Engine image
   */
  private async drawWEngineCenter(
    ctx: CanvasRenderingContext2D,
    data: ShareImageData,
  ): Promise<void> {
    if (!data.build.equippedWEngine?.icon) return;

    try {
      const wEngineImg = await this.loadImage(data.build.equippedWEngine.icon);

      // Position: top: 49%, left: 46.8%, transform: translate(-50%, -50%)
      const centerX = 350 + (this.WIDTH - 350) * 0.548;
      const centerY = 170 + 380 * 0.45;

      ctx.save();

      // Draw with gold glow
      ctx.shadowColor = 'rgba(244, 185, 66, 0.6)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;

      ctx.drawImage(
        wEngineImg,
        centerX - 90,
        centerY - 90,
        180,
        180,
      );

      ctx.restore();
    } catch (error) {
      console.warn('W-Engine image failed to load');
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Draw rounded rectangle
   */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number = 0,
  ): void {
    if (radius === 0) {
      ctx.rect(x, y, width, height);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  /**
   * Measure text width
   */
  private measureTextWidth(
    ctx: CanvasRenderingContext2D,
    text: string,
    font: string,
  ): number {
    ctx.save();
    ctx.font = font;
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  }

  /**
   * Get build rating color or gradient
   */
  private getBuildRatingColor(grade: string): string | CanvasGradient {
    switch (grade.toUpperCase()) {
      case 'VOID':
      case 'VOID HUNTER':
      case 'VOID-HUNTER':
        return '#e0bbe4'; // Fallback solid color
      case 'PHAETHON':
        return '#ffd700'; // Fallback solid color
      case 'SSS':
        return '#ff6b9d';
      case 'SS':
        return '#ff8c42';
      case 'S':
        return '#ffd93d';
      case 'A':
        return '#6bcf7f';
      case 'B':
        return '#4d96ff';
      case 'C':
        return '#1920e6';
      case 'D':
        return '#9c00de';
      case 'F':
        return '#6b1f00';
      default:
        return '#808080';
    }
  }

  /**
   * Create gradient for build rating badge
   */
  private createBuildRatingGradient(
    ctx: CanvasRenderingContext2D,
    grade: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): string | CanvasGradient {
    const gradeUpper = grade.toUpperCase();

    if (gradeUpper === 'VOID' || gradeUpper === 'VOID HUNTER' || gradeUpper === 'VOID-HUNTER') {
      // VOID HUNTER gradient: 135deg
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, '#e0bbe4');
      gradient.addColorStop(0.25, '#957dad');
      gradient.addColorStop(0.5, '#d291bc');
      gradient.addColorStop(0.75, '#fec8d8');
      gradient.addColorStop(1, '#ffdfd3');
      return gradient;
    }

    if (gradeUpper === 'PHAETHON') {
      // PHAETHON gradient: 135deg
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, '#ffd700');
      gradient.addColorStop(0.33, '#e5e4e2');
      gradient.addColorStop(0.66, '#b9f2ff');
      gradient.addColorStop(1, '#ffd700');
      return gradient;
    }

    // All other grades use solid colors
    return this.getBuildRatingColor(grade);
  }

  /**
   * Get disc rating color
   */
  private getDiscRatingColor(grade: string): string {
    switch (grade.toUpperCase()) {
      case 'VH':
        return '#e0bbe4'; // Fallback solid color
      case 'PHT':
        return '#ffd700'; // Fallback solid color
      case 'SSS':
        return '#ff6b9d';
      case 'SS':
        return '#ff8c42';
      case 'S':
        return '#ffd93d';
      case 'A':
        return '#6bcf7f';
      case 'B':
        return '#4d96ff';
      case 'C':
        return '#1920e6';
      case 'D':
        return '#9c00de';
      case 'F':
        return '#6b1f00';
      default:
        return '#808080';
    }
  }

  /**
   * Create gradient for disc rating badge
   */
  private createDiscRatingGradient(
    ctx: CanvasRenderingContext2D,
    grade: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): string | CanvasGradient {
    const gradeUpper = grade.toUpperCase();

    if (gradeUpper === 'VH') {
      // VOID HUNTER gradient: 135deg
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, '#e0bbe4');
      gradient.addColorStop(0.25, '#957dad');
      gradient.addColorStop(0.5, '#d291bc');
      gradient.addColorStop(0.75, '#fec8d8');
      gradient.addColorStop(1, '#ffdfd3');
      return gradient;
    }

    if (gradeUpper === 'PHT') {
      // PHAETHON gradient: 135deg
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, '#ffd700');
      gradient.addColorStop(0.33, '#e5e4e2');
      gradient.addColorStop(0.66, '#b9f2ff');
      gradient.addColorStop(1, '#ffd700');
      return gradient;
    }

    // All other grades use solid colors
    return this.getDiscRatingColor(grade);
  }

  /**
   * Format stat type for display
   */
  private formatStatType(statType: string): string {
    return statType.replace(/_/g, ' ');
  }

  /**
   * Get specialty icon path
   */
  private getSpecialtyIcon(specialty: string): string {
    const specialtyMap: { [key: string]: string } = {
      Attack: 'assets/data/images/roles/IconAttackType.webp',
      Stun: 'assets/data/images/roles/IconStun.webp',
      Anomaly: 'assets/data/images/roles/IconAnomaly.webp',
      Support: 'assets/data/images/roles/IconSupport.webp',
      Defense: 'assets/data/images/roles/IconDefense.webp',
      Rupture: 'assets/data/images/roles/IconRupture.webp',
    };
    return (
      specialtyMap[specialty] || 'assets/data/images/roles/IconAttackType.webp'
    );
  }

  /**
   * Get element icon path
   */
  private getElementIconPath(elementIcon: string): string {
    // Special element icons mapping (matches DataMappingService)
    const specialIconMap: { [key: string]: string } = {
      'Frost': 'IconFrost.webp',
      'AuricInk': 'IconAuricInk.webp',
      'HonedEdge': 'IconHonedEdge.webp'
    };

    // Check if it's a special element
    if (specialIconMap[elementIcon]) {
      return `assets/data/images/elements/${specialIconMap[elementIcon]}`;
    }

    // Standard element icon
    return `assets/data/images/elements/${elementIcon}.webp`;
  }

  /**
   * Convert relative URL to absolute URL for image loading
   */
  private getAbsoluteUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }

    const baseUrl =
      window.location.origin +
      window.location.pathname.replace(/\/[^/]*$/, '/');
    return path.startsWith('/') ? window.location.origin + path : baseUrl + path;
  }

  /**
   * Draw footer with substats breakdown and credits
   */
  private async drawFooter(
    ctx: CanvasRenderingContext2D,
    data: ShareImageData,
  ): Promise<void> {
    const accentColor = data.accentColor || '#f4b942';
    const footerHeight = 50;
    const footerY = this.HEIGHT - footerHeight;

    ctx.save();

    // Draw background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, footerY, this.WIDTH, footerHeight);

    // Draw top border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(this.WIDTH, footerY);
    ctx.stroke();

    // Draw substats breakdown (left side)
    ctx.fillStyle = '#eee';
    ctx.font = '400 10px Arial';
    ctx.textBaseline = 'middle';

    let textX = 12;
    const textY = footerY + footerHeight / 2;

    for (let i = 0; i < data.substatBreakdown.length; i++) {
      const stat = data.substatBreakdown[i];
      const isLast = i === data.substatBreakdown.length - 1;

      // Format stat text
      const statText = `(${stat.rollCount}) ${stat.name}: ${stat.value}${stat.isPercent ? '%' : ''}`;

      // Draw stat in priority color or normal color
      ctx.fillStyle = stat.isPriority ? '#ffd93d' : '#eee';
      ctx.font = stat.isPriority ? 'bold 10px Arial' : '400 10px Arial';
      ctx.fillText(statText, textX, textY);

      // Measure text width for next position
      const textWidth = this.measureTextWidth(ctx, statText, ctx.font);
      textX += textWidth;

      // Add separator if not last
      if (!isLast) {
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 10px Arial';
        ctx.fillText(' | ', textX, textY);
        textX += this.measureTextWidth(ctx, ' | ', 'bold 10px Arial');
      }
    }

    // Draw credits (right side)
    ctx.fillStyle = '#aaa';
    ctx.font = 'italic 9px Arial';
    ctx.textAlign = 'right';
    const creditsText = 'Made in southxpaw.github.io/zzz.optimizer';
    ctx.fillText(creditsText, this.WIDTH - 12, textY);

    ctx.restore();
  }

  /**
   * Convert hex color to rgba with alpha
   */
  private hexToRgba(hex: string, alpha: number): string {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse RGB values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
