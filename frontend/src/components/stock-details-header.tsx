'use client';

import Link from 'next/link';
import { ArrowLeft, Download, Settings } from 'lucide-react';
import { useExportStock } from '@/hooks/use-export';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Stock } from '@/types';

interface StockDetailsHeaderProps {
  stock: Stock;
  sector: string;
  onBack: () => void;
}

export function StockDetailsHeader({ stock, sector, onBack }: StockDetailsHeaderProps) {
  const {
    exportStock: exportJson,
    isLoading: isExportingJson,
  } = useExportStock({
    symbol: stock.symbol,
    sector: stock.sector,
    format: 'json',
  });

  const {
    exportStock: exportExcel,
    isLoading: isExportingExcel,
  } = useExportStock({
    symbol: stock.symbol,
    sector: stock.sector,
    format: 'xlsx',
  });

  const {
    exportStock: exportZip,
    isLoading: isExportingZip,
  } = useExportStock({
    symbol: stock.symbol,
    sector: stock.sector,
    format: 'zip',
  });

  return (
    <header className="sticky top-0 z-50 border-b border-border/30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 w-full">
      <div className="w-full px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Back + Symbol + Company Name */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-bold text-primary font-mono">{stock.symbol}</h1>
              <span className="text-lg text-muted-foreground">{stock.companyName}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <button
                onClick={() => {
                  window.location.href = '/';
                }}
                className="hover:text-foreground transition-colors"
              >
                Dashboard
              </button>
              <span>/</span>
              <button
                onClick={() => {
                  window.location.href = `/?sector=${encodeURIComponent(sector)}`;
                }}
                className="hover:text-foreground transition-colors"
              >
                {sector}
              </button>
              <span>/</span>
              <span className="text-foreground">{stock.symbol}</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isExportingJson || isExportingExcel || isExportingZip}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportJson} disabled={isExportingJson}>
                  {isExportingJson ? 'Exporting...' : 'Export as JSON'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel} disabled={isExportingExcel}>
                  {isExportingExcel ? 'Exporting...' : 'Export as Excel'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportZip} disabled={isExportingZip}>
                  {isExportingZip ? 'Exporting...' : 'Export as ZIP (Complete Package)'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

