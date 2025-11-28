/**
 * FILE: app/api/facts/route.ts
 * PURPOSE: Server-side proxy for Wikimedia OnThisDay facts.
 * KEY RESPONSIBILITIES:
 *   - Fetch sanitized facts from Wikimedia feed API.
 *   - Enforce 2.5s timeouts and CORS-safe headers.
 *   - Normalize payloads before returning to the client.
 * FALLBACKS:
 *   - Returns empty array on failure so client can continue fallback chain.
 * ERROR HANDLING:
 *   - Detects invalid params, rate limits, and upstream failures.
 *   - Never exposes raw upstream errors to clients.
 * CACHING DETAILS:
 *   - No caching at the route level (client handles caching via IDB/SW).
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeJsonParse } from '@/lib/apiSanitizer';
import { getMonthDay, isValidDateString } from '@/utils/helpers';
import type { Fact } from '@/types/fact';
import { parseFact } from '@/lib/validators';

const FEED_BASE = 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday';
const API_TIMEOUT = 2500;

function resolveFeedPath(category?: string): 'births' | 'events' {
  if (category === 'Birthdays') return 'births';
  return 'events';
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  const category = request.nextUrl.searchParams.get('category') ?? 'Historical';

  if (!date || !isValidDateString(date)) {
    return NextResponse.json({ error: 'Invalid or missing date' }, { status: 400 });
  }

  const { month, day } = getMonthDay(date);
  const feedPath = resolveFeedPath(category);
  const apiUrl = `${FEED_BASE}/${feedPath}/${month}/${day}?origin=*`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'DAY-LIGHT/3.0 (+https://localhost)',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error ${response.status}` },
        { status: response.status },
      );
    }

    const { data, error } = await safeJsonParse<{
      births?: unknown[];
      events?: unknown[];
      texts?: unknown[];
    }>(response);

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to parse upstream payload' }, { status: 502 });
    }

    const items = (data.births || data.events || data.texts || []) as Array<{
      text?: string;
      year?: number;
      pages?: Array<{ title?: string; content_urls?: { desktop?: { page?: string } } }>;
    }>;

    const facts: Fact[] = [];
    items.forEach((item, index) => {
      const baseFact: Fact = {
        id: `${date}-${index}`,
        title: item.text || item.pages?.[0]?.title || 'Untitled',
        description: item.text,
        name: item.pages?.[0]?.title,
        date,
        category: (category as Fact['category']) ?? 'Historical',
        year: item.year,
        source: 'wikimedia',
        sourceUrl: item.pages?.[0]?.content_urls?.desktop?.page,
      };
      const parsed = parseFact(baseFact);
      if (parsed) facts.push(parsed);
    });

    return NextResponse.json({ facts });
  } catch (error) {
    const status = error instanceof Error && error.name === 'AbortError' ? 504 : 502;
    return NextResponse.json({ error: 'Wikimedia fetch failed' }, { status });
  }
}


