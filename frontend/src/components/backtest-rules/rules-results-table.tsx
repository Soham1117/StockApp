'use client';

import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { BacktestRuleResult, RulesSortField, SortDirection } from '@/lib/backtest-rules-types';

interface RulesResultsTableProps {
  results: BacktestRuleResult[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: RulesSortField;
  sortDir: SortDirection;
  isLoading: boolean;
  onSort: (field: RulesSortField) => void;
  onPageChange: (page: number) => void;
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatRuleId(ruleId: string): string {
  // Convert "pe:lt_median|pb:lt_mean" to "P/E < median, P/B < mean"
  const metricNames: Record<string, string> = {
    pe: 'P/E',
    ps: 'P/S',
    pb: 'P/B',
    ev_ebit: 'EV/EBIT',
    ev_ebitda: 'EV/EBITDA',
    ev_sales: 'EV/Sales',
  };

  const operatorNames: Record<string, string> = {
    gt_zero: '> 0',
    lt_mean: '< mean',
    lt_median: '< median',
  };

  return ruleId
    .split('|')
    .map((rule) => {
      const [metric, operator] = rule.split(':');
      const metricName = metricNames[metric] || metric;
      const operatorName = operatorNames[operator] || operator;
      return `${metricName} ${operatorName}`;
    })
    .join(', ');
}

export function RulesResultsTable({
  results,
  total,
  page,
  pageSize,
  sortBy,
  sortDir,
  isLoading,
  onSort,
  onPageChange,
}: RulesResultsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  const getSortIcon = (field: RulesSortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
    }
    if (sortDir === 'desc') {
      return <ArrowDown className="h-3 w-3 ml-1" />;
    }
    return <ArrowUp className="h-3 w-3 ml-1" />;
  };

  const SortableHeader = ({
    field,
    children,
    className = '',
  }: {
    field: RulesSortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 hover:bg-transparent text-[11px]"
        onClick={() => onSort(field)}
      >
        {children}
        {getSortIcon(field)}
      </Button>
    </TableHead>
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="p-8 text-center border border-border rounded-md">
        <p className="text-muted-foreground">No backtest rules found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-md border border-border custom-scrollbar">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <SortableHeader field="rule_id">Rule</SortableHeader>
              <SortableHeader field="sector">Sector</SortableHeader>
              <SortableHeader field="cap">Cap</SortableHeader>
              <SortableHeader field="holding_years" className="text-right">
                Hold
              </SortableHeader>
              <SortableHeader field="train_avg_portfolio" className="text-right">
                Return
              </SortableHeader>
              <SortableHeader field="train_avg_benchmark" className="text-right">
                SPY
              </SortableHeader>
              <SortableHeader field="train_avg_excess" className="text-right">
                Excess
              </SortableHeader>
              <SortableHeader field="train_win_rate" className="text-right">
                Win Rate
              </SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => {
              const rowKey = `${result.sector}-${result.cap}-${result.holding_years}-${result.rule_id}`;
              const isExpanded = expandedRows.has(rowKey);
              const hasPositiveExcess =
                result.train_avg_excess != null && result.train_avg_excess > 0;

              return (
                <Fragment key={rowKey}>
                  <TableRow
                    className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                    onClick={() => toggleRow(rowKey)}
                  >
                    <TableCell className="w-8 p-2">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      <span className="text-xs font-mono truncate block">
                        {formatRuleId(result.rule_id)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{result.sector}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {result.cap}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {result.holding_years}y
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {pct(result.train_avg_portfolio)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {pct(result.train_avg_benchmark)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs font-semibold ${
                        hasPositiveExcess ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {hasPositiveExcess ? '+' : ''}
                      {pct(result.train_avg_excess)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {pct(result.train_win_rate, 0)}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={9} className="p-4">
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                              Tickers Used ({result.tickers_used.length})
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {result.tickers_used.map((ticker) => (
                                <Badge key={ticker} variant="secondary" className="text-[10px]">
                                  {ticker}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          {result.avg_filtered_size != null && (
                            <div className="text-xs text-muted-foreground">
                              Avg filtered universe size: {result.avg_filtered_size.toFixed(0)}{' '}
                              stocks
                            </div>
                          )}
                          {result.selected_by_point && result.selected_by_point.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                                Selection Periods
                              </p>
                              <div className="text-xs space-y-1">
                                {result.selected_by_point.map((point, idx) => (
                                  <div key={idx} className="text-muted-foreground">
                                    {point.as_of} → {point.end_date}:{' '}
                                    <span className="font-mono">{point.symbols.join(', ')}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}{' '}
            results
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
