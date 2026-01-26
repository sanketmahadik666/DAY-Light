/**
 * Analytics Reports API
 * Returns aggregated analytics data for charts
 */

import { NextRequest, NextResponse } from 'next/server';

const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const reportType = searchParams.get('type') || 'all';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Fetch from metadata service
    const params = new URLSearchParams();
    if (reportType) params.set('type', reportType);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const response = await fetch(
      `${METADATA_SERVICE_URL}/api/analytics/reports?${params.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Analytics service error: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data: data.data || data,
    });
  } catch (error) {
    console.error('Analytics reports error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
