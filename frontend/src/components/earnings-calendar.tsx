'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import type { EarningsCalendar, EarningsEvent } from '@/types';

interface EarningsCalendarProps {
  symbol: string;
}

export function EarningsCalendar({ symbol }: EarningsCalendarProps) {
  const [data, setData] = useState<EarningsCalendar | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCalendar() {
      try {
        const res = await fetch(`/api/stocks/${symbol}/earnings/calendar`);
        if (res.ok) {
          const calendar = await res.json();
          setData(calendar);
        }
      } catch (error) {
        // Failed to fetch earnings calendar
      } finally {
        setIsLoading(false);
      }
    }

    fetchCalendar();
  }, [symbol]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.events || data.events.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Calendar className="h-6 w-6" />
            Earnings Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-base text-muted-foreground">No earnings calendar data available</p>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const upcoming = data.events.filter((e) => {
    if (!e.date) return false;
    try {
      const eventDate = parseISO(e.date);
      return isAfter(eventDate, now);
    } catch {
      return false;
    }
  });

  const recent = data.events.filter((e) => {
    if (!e.date) return false;
    try {
      const eventDate = parseISO(e.date);
      return isBefore(eventDate, now) || eventDate.getTime() === now.getTime();
    } catch {
      return false;
    }
  });

  const nextEarnings = upcoming[0];

  function getSurpriseBadge(event: EarningsEvent) {
    if (event.surprisePercent == null) return null;
    const percent = event.surprisePercent;
    if (percent > 5) {
      return (
        <Badge variant="default" className="bg-green-500">
          <TrendingUp className="h-3 w-3 mr-1" />
          Beat {percent.toFixed(1)}%
        </Badge>
      );
    } else if (percent < -5) {
      return (
        <Badge variant="destructive">
          <TrendingDown className="h-3 w-3 mr-1" />
          Miss {Math.abs(percent).toFixed(1)}%
        </Badge>
      );
    } else if (percent > 0) {
      return (
        <Badge variant="secondary" className="bg-green-500/20">
          Beat {percent.toFixed(1)}%
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="bg-red-500/20">
          Miss {Math.abs(percent).toFixed(1)}%
        </Badge>
      );
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Calendar className="h-6 w-6" />
          Earnings Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Next Earnings - Prominent */}
        {nextEarnings && (
          <div className="p-3 rounded-lg border-2 border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-base font-semibold text-foreground">Next Earnings</span>
              {nextEarnings.date && (
                <span className="text-xl font-bold text-primary">
                  {format(parseISO(nextEarnings.date), 'MMM d, yyyy')}
                </span>
              )}
            </div>
            {nextEarnings.estimate != null && (
              <div className="text-base text-muted-foreground">
                Estimate: <span className="font-mono font-semibold">${nextEarnings.estimate.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Recent Earnings (Last 4) */}
        {recent.length > 0 && (
          <div>
            <h4 className="text-base font-semibold mb-2 text-foreground">Recent Earnings</h4>
            <div className="space-y-2">
              {recent.slice(0, 4).map((event, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded border text-base">
                  <div className="flex-1">
                    {event.date && (
                      <div className="font-medium text-foreground">
                        {format(parseISO(event.date), 'MMM d, yyyy')}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {event.actual != null && (
                        <span className="text-muted-foreground">
                          Actual: <span className="font-mono font-semibold text-foreground">${event.actual.toFixed(2)}</span>
                        </span>
                      )}
                      {event.estimate != null && (
                        <span className="text-muted-foreground">
                          Est: <span className="font-mono">${event.estimate.toFixed(2)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div>{getSurpriseBadge(event)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recent.length === 0 && !nextEarnings && (
          <p className="text-base text-muted-foreground">No earnings events found</p>
        )}
      </CardContent>
    </Card>
  );
}

