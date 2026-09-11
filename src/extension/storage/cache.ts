import * as vscode from 'vscode';
import { WebviewData } from '../webview/messaging';

const CACHE_KEY_PREFIX = 'prwalk.cache.v5.';

interface CacheEntry {
  data: WebviewData;
  timestamp: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export class WalkthroughCache {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get cached walkthrough data for a PR URL
   */
  async get(prUrl: string): Promise<WebviewData | null> {
    const cacheKey = this.getCacheKey(prUrl);
    const cached = await this.context.globalState.get<CacheEntry>(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL) {
      await this.delete(prUrl);
      return null;
    }

    return cached.data;
  }

  /**
   * Cache walkthrough data for a PR URL
   */
  async set(prUrl: string, data: WebviewData): Promise<void> {
    const cacheKey = this.getCacheKey(prUrl);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
    };

    await this.context.globalState.update(cacheKey, entry);
  }

  /**
   * Delete cached data for a PR URL
   */
  async delete(prUrl: string): Promise<void> {
    const cacheKey = this.getCacheKey(prUrl);
    await this.context.globalState.update(cacheKey, undefined);
  }

  /**
   * Clear all cached walkthroughs
   */
  async clear(): Promise<void> {
    const keys = await this.getAllCacheKeys();
    for (const key of keys) {
      await this.context.globalState.update(key, undefined);
    }
  }

  /**
   * Get all cache keys for walkthroughs
   */
  private async getAllCacheKeys(): Promise<string[]> {
    const allKeys = this.context.globalState.keys();
    return allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
  }

  /**
   * Generate cache key from PR URL
   */
  private getCacheKey(prUrl: string): string {
    // Create a hash of the URL to use as cache key
    // For simplicity, we'll use a simple encoding
    const encoded = Buffer.from(prUrl).toString('base64');
    return `${CACHE_KEY_PREFIX}${encoded}`;
  }

  /**
   * Check if a PR URL is cached
   */
  async has(prUrl: string): Promise<boolean> {
    const cached = await this.get(prUrl);
    return cached !== null;
  }
}
