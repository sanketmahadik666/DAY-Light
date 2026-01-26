/**
 * Analytics Collection API
 * Receives analytics data from frontend
 */

import { NextRequest, NextResponse } from 'next/server';

const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { factViews, apiCalls, timestamp } = body;

    // Forward to metadata service
    const response = await fetch(`${METADATA_SERVICE_URL}/api/analytics/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        factViews: factViews || [],
        apiCalls: apiCalls || [],
        timestamp: timestamp || Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Analytics service error: ${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Analytics collection error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
