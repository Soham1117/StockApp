'use client';

import { useIndustries } from '@/hooks/use-industries';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface IndustrySelectorProps {
  selectedIndustry: string | null;
  onSelectIndustry: (sector: string) => void;
}

export function IndustrySelector({ selectedIndustry, onSelectIndustry }: IndustrySelectorProps) {
  const { data, isLoading, error } = useIndustries();

  if (isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        Failed to load sectors
      </div>
    );
  }

  // Use sectors instead of industries
  const sectors = data?.sectors || [];

  return (
    <Select value={selectedIndustry || ''} onValueChange={onSelectIndustry}>
      <SelectTrigger size="sm" className="w-full text-[11px]">
        <SelectValue placeholder="Select a sector..." />
      </SelectTrigger>
      <SelectContent>
        {sectors.map((sector) => (
          <SelectItem key={sector} value={sector}>
            {sector}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
