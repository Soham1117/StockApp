import { NextResponse } from 'next/server';
import { clearAllCache, getCacheStats } from '@/lib/cache';

/**
 * POST /api/cache/clear
 * Clear all cache entries (useful for development/testing)
 */
export async function POST() {
  try {
    const stats = getCacheStats();
    clearAllCache();
    return NextResponse.json({
      success: true,
      message: 'Cache cleared',
      previousSize: stats.size,
    });
  } catch (error) {
    console.error('[API] Error clearing cache:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear cache',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cache/clear
 * Get cache statistics
 */
export async function GET() {
  try {
    const stats = getCacheStats();
    return NextResponse.json({
      size: stats.size,
      max: stats.max,
    });
  } catch (error) {
    console.error('[API] Error getting cache stats:', error);
    return NextResponse.json(
      {
        error: 'Failed to get cache stats',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

