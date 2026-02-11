'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Globe, Package } from 'lucide-react';
import type { RevenueBreakdown } from '@/types';

interface RevenueBreakdownProps {
  symbol: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

export function RevenueBreakdown({ symbol }: RevenueBreakdownProps) {
  const [data, setData] = useState<RevenueBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchBreakdown() {
      try {
        const res = await fetch(`/api/stocks/${symbol}/revenue/breakdown`);
        if (res.ok) {
          const breakdown = await res.json();
          setData(breakdown);
        }
      } catch (error) {
        // Failed to fetch revenue breakdown
      } finally {
        setIsLoading(false);
      }
    }

    fetchBreakdown();
  }, [symbol]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || (data.geography.length === 0 && data.segments.length === 0)) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Globe className="h-6 w-6" />
            Revenue Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-base text-muted-foreground">No revenue breakdown data available</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate percentages for pie charts
  const totalGeo = data.geography.reduce((sum, item) => sum + item.value, 0);
  const totalSeg = data.segments.reduce((sum, item) => sum + item.value, 0);

  const geoData = data.geography.map((item) => ({
    name: item.name,
    value: item.value,
    percentage: totalGeo > 0 ? ((item.value / totalGeo) * 100).toFixed(1) : '0',
  }));

  const segData = data.segments.map((item) => ({
    name: item.name,
    value: item.value,
    percentage: totalSeg > 0 ? ((item.value / totalSeg) * 100).toFixed(1) : '0',
  }));

  const formatCurrency = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Globe className="h-6 w-6" />
          Revenue Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {data.geography.length > 0 && (
          <div>
            <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Globe className="h-5 w-5" />
              By Geography
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={geoData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={0} textAnchor="middle" height={40} />
                <YAxis tickFormatter={formatCurrency} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  labelFormatter={(label) => `Region: ${label}`}
                />
                <Bar dataKey="value" fill="#0088FE">
                  {geoData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {geoData.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium">
                    {formatCurrency(item.value)} ({item.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.segments.length > 0 && (
          <div>
            <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Package className="h-5 w-5" />
              By Segment
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={segData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={0} textAnchor="middle" height={40} />
                <YAxis tickFormatter={formatCurrency} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  labelFormatter={(label) => `Segment: ${label}`}
                />
                <Bar dataKey="value" fill="#00C49F">
                  {segData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {segData.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium">
                    {formatCurrency(item.value)} ({item.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

