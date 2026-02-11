'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { StockMetrics } from '@/types';

interface HealthDashboardProps {
  metrics?: StockMetrics;
}

function detectRedFlags(metrics?: StockMetrics): Array<{ severity: 'high' | 'medium' | 'low'; message: string }> {
  const flags: Array<{ severity: 'high' | 'medium' | 'low'; message: string }> = [];
  if (!metrics) return flags;

  const r = metrics.ratios;

  // Helper to get nested value
  function getNested(path: string): number | undefined {
    const parts = path.split('.');
    let current: any = r;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return typeof current === 'number' && isFinite(current) ? current : undefined;
  }

  // High P/S + Low Growth
  const psRatio = r.priceToSalesRatioTTM;
  const revenueGrowth = getNested('growth.revenueGrowthTTM');
  if (psRatio != null && revenueGrowth != null) {
    if (psRatio > 10 && revenueGrowth < 0.05) {
      flags.push({
        severity: 'high',
        message: `High P/S ratio (${psRatio.toFixed(1)}) with low revenue growth (${(revenueGrowth * 100).toFixed(1)}%) - potential overvaluation`,
      });
    } else if (psRatio > 5 && revenueGrowth < 0.1) {
      flags.push({
        severity: 'medium',
        message: `Elevated P/S ratio (${psRatio.toFixed(1)}) with modest growth (${(revenueGrowth * 100).toFixed(1)}%)`,
      });
    }
  }

  // High Leverage
  const debtToEquity = getNested('financialHealth.debtToEquity');
  if (debtToEquity != null) {
    if (debtToEquity > 2.0) {
      flags.push({
        severity: 'high',
        message: `High debt-to-equity ratio (${debtToEquity.toFixed(2)}) - elevated financial risk`,
      });
    } else if (debtToEquity > 1.0) {
      flags.push({
        severity: 'medium',
        message: `Moderate leverage (debt-to-equity: ${debtToEquity.toFixed(2)})`,
      });
    }
  }

  // Negative FCF
  const fcfYield = getNested('cashFlow.fcfYield');
  const fcfTTM = getNested('cashFlow.fcfTTM');
  if (fcfYield != null && fcfYield < 0) {
    flags.push({
      severity: 'high',
      message: `Negative FCF yield (${(fcfYield * 100).toFixed(1)}%) - company burning cash`,
    });
  } else if (fcfTTM != null && fcfTTM < 0) {
    flags.push({
      severity: 'high',
      message: `Negative free cash flow ($${Math.abs(fcfTTM / 1_000_000).toFixed(1)}M) - cash burn concern`,
    });
  }

  // Low Interest Coverage
  const interestCoverage = getNested('financialHealth.interestCoverage');
  if (interestCoverage != null) {
    if (interestCoverage < 1.0) {
      flags.push({
        severity: 'high',
        message: `Interest coverage below 1.0 (${interestCoverage.toFixed(2)}) - cannot cover interest payments`,
      });
    } else if (interestCoverage < 2.0) {
      flags.push({
        severity: 'medium',
        message: `Low interest coverage (${interestCoverage.toFixed(2)}) - limited margin of safety`,
      });
    }
  }

  // Negative Operating Margin
  const operatingMargin = getNested('profitability.operatingMargin');
  if (operatingMargin != null && operatingMargin < 0) {
    flags.push({
      severity: 'high',
      message: `Negative operating margin (${(operatingMargin * 100).toFixed(1)}%) - unprofitable operations`,
    });
  }

  return flags;
}

export function HealthDashboard({ metrics }: HealthDashboardProps) {
  const redFlags = detectRedFlags(metrics);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health Dashboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {redFlags.length > 0 && (
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-red-500 w-full">
              <AlertTriangle className="h-4 w-4" />
              Red Flags ({redFlags.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {redFlags.map((flag, idx) => (
                <div
                  key={idx}
                  className={`rounded-md border p-2 text-sm ${
                    flag.severity === 'high'
                      ? 'border-red-500/30 bg-red-500/10 text-red-400'
                      : flag.severity === 'medium'
                        ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                        : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                  }`}
                >
                  {flag.message}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {redFlags.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No significant red flags detected. Company appears financially healthy.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

