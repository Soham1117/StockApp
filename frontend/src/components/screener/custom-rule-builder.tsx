'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import type { CustomRule } from '@/lib/saved-screens-api';

// Available metrics for filtering
const METRIC_OPTIONS = [
  // Valuation metrics
  { value: 'peRatioTTM', label: 'P/E Ratio (TTM)' },
  { value: 'priceToSalesRatioTTM', label: 'P/S Ratio (TTM)' },
  { value: 'priceToBookRatioTTM', label: 'P/B Ratio (TTM)' },
  { value: 'dividendYieldTTM', label: 'Dividend Yield (TTM)' },
  { value: 'enterpriseValueOverEBITTTM', label: 'EV/EBIT (TTM)' },
  { value: 'enterpriseValueOverEBITDATTM', label: 'EV/EBITDA (TTM)' },
  { value: 'enterpriseValueToSalesTTM', label: 'EV/Sales (TTM)' },
  // Profitability metrics
  { value: 'profitability.roe', label: 'ROE' },
  { value: 'profitability.roa', label: 'ROA' },
  { value: 'profitability.roic', label: 'ROIC' },
  { value: 'profitability.grossMargin', label: 'Gross Margin' },
  { value: 'profitability.operatingMargin', label: 'Operating Margin' },
  { value: 'profitability.netMargin', label: 'Net Margin' },
  // Growth metrics
  { value: 'growth.revenueGrowthTTM', label: 'Revenue Growth (TTM)' },
  { value: 'growth.ebitGrowthTTM', label: 'EBIT Growth (TTM)' },
  { value: 'growth.epsGrowthTTM', label: 'EPS Growth (TTM)' },
  { value: 'growth.fcfGrowthTTM', label: 'FCF Growth (TTM)' },
  // Financial health metrics
  { value: 'financialHealth.debtToEquity', label: 'Debt to Equity' },
  { value: 'financialHealth.currentRatio', label: 'Current Ratio' },
  // Cash flow metrics
  { value: 'cashFlow.fcfTTM', label: 'Free Cash Flow (TTM)' },
  // Valuation extras
  { value: 'valuationExtras.forwardPE', label: 'Forward P/E' },
  { value: 'valuationExtras.pegRatio', label: 'PEG Ratio' },
] as const;

const OPERATOR_OPTIONS = [
  { value: '<', label: 'Less than (<)' },
  { value: '<=', label: 'Less than or equal (≤)' },
  { value: '>', label: 'Greater than (>)' },
  { value: '>=', label: 'Greater than or equal (≥)' },
  { value: '=', label: 'Equal (=)' },
  { value: '!=', label: 'Not equal (≠)' },
  { value: 'between', label: 'Between' },
] as const;

interface CustomRuleBuilderProps {
  rules: CustomRule[];
  onAddRule: (rule: CustomRule) => void;
  onUpdateRule: (ruleId: string, updates: Partial<CustomRule>) => void;
  onRemoveRule: (ruleId: string) => void;
}

export function CustomRuleBuilder({
  rules,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
}: CustomRuleBuilderProps) {
  const [newRule, setNewRule] = useState<Partial<CustomRule>>({
    metric: undefined,
    operator: '<',
    value: 0,
    enabled: true,
  });

  const handleAddRule = () => {
    if (!newRule.metric || newRule.value === undefined) return;

    const rule: CustomRule = {
      id: crypto.randomUUID(),
      metric: newRule.metric,
      operator: newRule.operator || '<',
      value: newRule.value,
      enabled: true,
    };

    onAddRule(rule);
    setNewRule({ metric: undefined, operator: '<', value: 0, enabled: true });
  };

  const handleUpdateValue = (ruleId: string, value: number | [number, number]) => {
    onUpdateRule(ruleId, { value });
  };

  const isBetween = newRule.operator === 'between';
  const canAdd = newRule.metric && newRule.value !== undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Custom Rules</Label>
        <span className="text-[10px] text-muted-foreground">
          {rules.filter((r) => r.enabled).length} active
        </span>
      </div>

      {/* Existing Rules */}
      {rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule) => {
            const metricLabel = METRIC_OPTIONS.find((m) => m.value === rule.metric)?.label || rule.metric;
            const operatorLabel = OPERATOR_OPTIONS.find((o) => o.value === rule.operator)?.label || rule.operator;
            const isRuleBetween = rule.operator === 'between';

            return (
              <div
                key={rule.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                  rule.enabled ? 'border-border bg-background/50' : 'border-border bg-muted/30 opacity-70'
                }`}
              >
                <button
                  onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
                  className={`h-4 w-4 rounded border ${
                    rule.enabled ? 'bg-primary border-primary' : 'border-border'
                  }`}
                  aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                />
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-[11px] min-w-0">
                    <span className="font-medium truncate">{metricLabel}</span>
                    <span className="text-muted-foreground shrink-0">{operatorLabel}</span>
                    {isRuleBetween ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={Array.isArray(rule.value) ? rule.value[0] : 0}
                          onChange={(e) => {
                            const min = parseFloat(e.target.value) || 0;
                            const max = Array.isArray(rule.value) ? rule.value[1] : min;
                            handleUpdateValue(rule.id, [min, max]);
                          }}
                          className="h-7 w-20 text-[11px]"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={Array.isArray(rule.value) ? rule.value[1] : 0}
                          onChange={(e) => {
                            const max = parseFloat(e.target.value) || 0;
                            const min = Array.isArray(rule.value) ? rule.value[0] : 0;
                            handleUpdateValue(rule.id, [min, max]);
                          }}
                          className="h-7 w-20 text-[11px]"
                        />
                      </div>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        value={typeof rule.value === 'number' ? rule.value : 0}
                        onChange={(e) => {
                          handleUpdateValue(rule.id, parseFloat(e.target.value) || 0);
                        }}
                        className="h-7 w-24 text-[11px]"
                      />
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onRemoveRule(rule.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Rule */}
      <div className="space-y-2 rounded-md border border-dashed border-border p-2">
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={newRule.metric || ''}
            onValueChange={(value) => setNewRule({ ...newRule, metric: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              {METRIC_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={newRule.operator}
            onValueChange={(value) =>
              setNewRule({ ...newRule, operator: value as CustomRule['operator'] })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATOR_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isBetween ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              placeholder="Min"
              value={Array.isArray(newRule.value) ? newRule.value[0] : 0}
              onChange={(e) => {
                const min = parseFloat(e.target.value) || 0;
                const max = Array.isArray(newRule.value) ? newRule.value[1] : min;
                setNewRule({ ...newRule, value: [min, max] });
              }}
              className="h-8 text-[11px]"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <Input
              type="number"
              step="0.01"
              placeholder="Max"
              value={Array.isArray(newRule.value) ? newRule.value[1] : 0}
              onChange={(e) => {
                const max = parseFloat(e.target.value) || 0;
                const min = Array.isArray(newRule.value) ? newRule.value[0] : 0;
                setNewRule({ ...newRule, value: [min, max] });
              }}
              className="h-8 text-[11px]"
            />
          </div>
        ) : (
          <Input
            type="number"
            step="0.01"
            placeholder="Value"
            value={typeof newRule.value === 'number' ? newRule.value : 0}
            onChange={(e) =>
              setNewRule({ ...newRule, value: parseFloat(e.target.value) || 0 })
            }
            className="h-8 text-[11px]"
          />
        )}

        <Button
          onClick={handleAddRule}
          disabled={!canAdd}
          size="sm"
          className="w-full"
          variant="outline"
        >
          <Plus className="mr-2 h-3 w-3" />
          Add Rule
        </Button>
      </div>
    </div>
  );
}

