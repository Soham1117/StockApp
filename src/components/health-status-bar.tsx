'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { StockMetrics } from '@/types';

interface HealthStatusBarProps {
  metrics?: StockMetrics;
}

function calculateHealthScore(metrics?: StockMetrics): {
  overall: number;
  growth: number;
  value: number;
  profitability: number;
  financialHealth: number;
  cashFlow: number;
} {
  if (!metrics) {
    return {
      overall: 0,
      growth: 0,
      value: 0,
      profitability: 0,
      financialHealth: 0,
      cashFlow: 0,
    };
  }

  const r = metrics.ratios;

  // Growth Score (0-100)
  const revenueGrowth = r.growth?.revenueGrowthTTM ?? 0;
  const epsGrowth = r.growth?.epsGrowthTTM ?? 0;
  const fcfGrowth = r.growth?.fcfGrowthTTM ?? 0;
  const growthScore = Math.min(
    100,
    Math.max(
      0,
      (revenueGrowth * 50 + epsGrowth * 30 + fcfGrowth * 20) * 100
    )
  );

  // Value Score (0-100) - Lower ratios are better
  const pe = r.peRatioTTM ?? 0;
  const ps = r.priceToSalesRatioTTM ?? 0;
  const evEbitda = r.enterpriseValueOverEBITDATTM ?? 0;
  let valueScore = 50; // Neutral baseline
  if (pe > 0 && pe < 20) valueScore += 20;
  if (pe >= 20 && pe < 30) valueScore += 10;
  if (pe >= 30) valueScore -= 20;
  if (ps > 0 && ps < 5) valueScore += 15;
  if (ps >= 5 && ps < 10) valueScore += 5;
  if (ps >= 10) valueScore -= 15;
  valueScore = Math.min(100, Math.max(0, valueScore));

  // Profitability Score (0-100)
  const roe = r.profitability?.roe ?? 0;
  const roa = r.profitability?.roa ?? 0;
  const roic = r.profitability?.roic ?? 0;
  const operatingMargin = r.profitability?.operatingMargin ?? 0;
  const profitabilityScore = Math.min(
    100,
    Math.max(
      0,
      (roe * 30 + roa * 20 + roic * 30 + operatingMargin * 20) * 100
    )
  );

  // Financial Health Score (0-100)
  const debtToEquity = r.financialHealth?.debtToEquity ?? 0;
  const interestCoverage = r.financialHealth?.interestCoverage ?? 0;
  const currentRatio = r.financialHealth?.currentRatio ?? 0;
  let financialHealthScore = 50;
  if (debtToEquity > 0 && debtToEquity < 1) financialHealthScore += 20;
  if (debtToEquity >= 1 && debtToEquity < 2) financialHealthScore += 10;
  if (debtToEquity >= 2) financialHealthScore -= 30;
  if (interestCoverage > 0 && interestCoverage >= 5) financialHealthScore += 20;
  if (interestCoverage > 0 && interestCoverage >= 2 && interestCoverage < 5) financialHealthScore += 10;
  if (interestCoverage > 0 && interestCoverage < 1) financialHealthScore -= 30;
  if (currentRatio > 0 && currentRatio >= 1.5) financialHealthScore += 10;
  if (currentRatio > 0 && currentRatio < 1) financialHealthScore -= 20;
  financialHealthScore = Math.min(100, Math.max(0, financialHealthScore));

  // Cash Flow Score (0-100)
  const fcfYield = r.cashFlow?.fcfYield ?? 0;
  const fcfMargin = r.cashFlow?.fcfMargin ?? 0;
  const ocfToDebt = r.financialHealth?.ocfToDebt ?? 0;
  let cashFlowScore = 50;
  if (fcfYield > 0.05) cashFlowScore += 30;
  if (fcfYield > 0 && fcfYield <= 0.05) cashFlowScore += 15;
  if (fcfYield < 0) cashFlowScore -= 30;
  if (fcfMargin > 0.1) cashFlowScore += 20;
  if (fcfMargin > 0 && fcfMargin <= 0.1) cashFlowScore += 10;
  if (fcfMargin < 0) cashFlowScore -= 20;
  cashFlowScore = Math.min(100, Math.max(0, cashFlowScore));

  // Overall weighted score
  const overall = Math.round(
    growthScore * 0.30 +
    valueScore * 0.20 +
    profitabilityScore * 0.25 +
    financialHealthScore * 0.15 +
    cashFlowScore * 0.10
  );

  return {
    overall: Math.min(100, Math.max(0, overall)),
    growth: Math.round(growthScore),
    value: Math.round(valueScore),
    profitability: Math.round(profitabilityScore),
    financialHealth: Math.round(financialHealthScore),
    cashFlow: Math.round(cashFlowScore),
  };
}

function getHealthColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-green-400';
  if (score >= 40) return 'text-yellow-500';
  if (score >= 20) return 'text-orange-500';
  return 'text-red-500';
}

function getHealthBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-green-400';
  if (score >= 40) return 'bg-yellow-500';
  if (score >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

function getHealthReason(score: number, category: string, metrics?: StockMetrics): string {
  if (score >= 20) return ''; // Not red, no reason needed
  
  const r = metrics?.ratios;
  
  switch (category) {
    case 'growth':
      const revenueGrowth = r?.growth?.revenueGrowthTTM ?? 0;
      const epsGrowth = r?.growth?.epsGrowthTTM ?? 0;
      const fcfGrowth = r?.growth?.fcfGrowthTTM ?? 0;
      const reasons: string[] = [];
      if (revenueGrowth < 0.05) reasons.push(`Low revenue growth (${(revenueGrowth * 100).toFixed(1)}%)`);
      if (epsGrowth < 0) reasons.push(`Negative EPS growth (${(epsGrowth * 100).toFixed(1)}%)`);
      if (fcfGrowth < 0) reasons.push(`Negative FCF growth (${(fcfGrowth * 100).toFixed(1)}%)`);
      return reasons.length > 0 ? reasons.join(', ') : 'Poor growth metrics across all indicators';
      
    case 'value':
      const pe = r?.peRatioTTM ?? 0;
      const ps = r?.priceToSalesRatioTTM ?? 0;
      const evEbitda = r?.enterpriseValueOverEBITDATTM ?? 0;
      const valueReasons: string[] = [];
      if (pe > 30) valueReasons.push(`High P/E ratio (${pe.toFixed(1)})`);
      if (ps > 10) valueReasons.push(`High P/S ratio (${ps.toFixed(1)})`);
      if (evEbitda && evEbitda > 20) valueReasons.push(`High EV/EBITDA (${evEbitda.toFixed(1)})`);
      return valueReasons.length > 0 ? valueReasons.join(', ') : 'Elevated valuation ratios';
      
    case 'profitability':
      const roe = r?.profitability?.roe ?? 0;
      const roa = r?.profitability?.roa ?? 0;
      const roic = r?.profitability?.roic ?? 0;
      const operatingMargin = r?.profitability?.operatingMargin ?? 0;
      const profitReasons: string[] = [];
      if (roe < 0.1) profitReasons.push(`Low ROE (${(roe * 100).toFixed(1)}%)`);
      if (roa < 0.05) profitReasons.push(`Low ROA (${(roa * 100).toFixed(1)}%)`);
      if (roic < 0.1) profitReasons.push(`Low ROIC (${(roic * 100).toFixed(1)}%)`);
      if (operatingMargin < 0) profitReasons.push(`Negative operating margin (${(operatingMargin * 100).toFixed(1)}%)`);
      return profitReasons.length > 0 ? profitReasons.join(', ') : 'Weak profitability metrics';
      
    case 'financialHealth':
      const debtToEquity = r?.financialHealth?.debtToEquity ?? 0;
      const interestCoverage = r?.financialHealth?.interestCoverage ?? 0;
      const currentRatio = r?.financialHealth?.currentRatio ?? 0;
      const healthReasons: string[] = [];
      if (debtToEquity > 2) healthReasons.push(`High debt-to-equity (${debtToEquity.toFixed(2)})`);
      if (interestCoverage > 0 && interestCoverage < 1) healthReasons.push(`Low interest coverage (${interestCoverage.toFixed(2)})`);
      if (currentRatio > 0 && currentRatio < 1) healthReasons.push(`Low current ratio (${currentRatio.toFixed(2)})`);
      return healthReasons.length > 0 ? healthReasons.join(', ') : 'Financial health concerns';
      
    case 'cashFlow':
      const fcfYield = r?.cashFlow?.fcfYield ?? 0;
      const fcfMargin = r?.cashFlow?.fcfMargin ?? 0;
      const cashReasons: string[] = [];
      if (fcfYield < 0) cashReasons.push(`Negative FCF yield (${(fcfYield * 100).toFixed(1)}%)`);
      if (fcfMargin < 0) cashReasons.push(`Negative FCF margin (${(fcfMargin * 100).toFixed(1)}%)`);
      return cashReasons.length > 0 ? cashReasons.join(', ') : 'Poor cash flow generation';
      
    default:
      return 'Low score indicates concerns in this category';
  }
}

export function HealthStatusBar({ metrics }: HealthStatusBarProps) {
  const scores = calculateHealthScore(metrics);

  return (
    <Card className="h-full">
      <CardContent className="py-2">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-muted-foreground">Overall Health:</span>
            <div className="flex items-center gap-2">
              <span className={`text-3xl font-bold font-mono ${getHealthColor(scores.overall)}`}>
                {scores.overall}
              </span>
              <Progress value={scores.overall} className="w-24 h-2" />
              <Badge
                variant="outline"
                className={`text-base ${getHealthColor(scores.overall)} border-current`}
              >
                {scores.overall >= 80
                  ? 'Excellent'
                  : scores.overall >= 60
                    ? 'Good'
                    : scores.overall >= 40
                      ? 'Fair'
                      : scores.overall >= 20
                        ? 'Poor'
                        : 'Critical'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 text-base flex-wrap">
            {[
              { key: 'growth', label: 'Growth', score: scores.growth },
              { key: 'value', label: 'Value', score: scores.value },
              { key: 'profitability', label: 'Profitability', score: scores.profitability },
              { key: 'financialHealth', label: 'Financial Health', score: scores.financialHealth },
              { key: 'cashFlow', label: 'Cash Flow', score: scores.cashFlow },
            ].map((item) => {
              const isRed = item.score < 20;
              const reason = isRed ? getHealthReason(item.score, item.key, metrics) : '';
              
              const content = (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{item.label}:</span>
                  <span className={`text-lg font-mono font-semibold ${getHealthColor(item.score)} ${isRed ? 'cursor-help underline decoration-dotted' : ''}`}>
                    {item.score}
                  </span>
                </div>
              );
              
              if (isRed && reason) {
                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{item.label}:</span>
                        <span className={`text-lg font-mono font-semibold ${getHealthColor(item.score)} cursor-help underline decoration-dotted`}>
                          {item.score}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-base">{reason}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }
              
              return <div key={item.key}>{content}</div>;
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

