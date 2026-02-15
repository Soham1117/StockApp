export type WeightPresetKey = 'equal' | 'value' | 'growth' | 'quality' | 'custom';

export const VALUATION_WEIGHT_PRESETS: Record<
  WeightPresetKey,
  {
    label: string;
    description: string;
    weights: Record<string, number>;
  }
> = {
  equal: {
    label: 'Equal',
    description: 'Equal weight for all valuation multiples',
    weights: { pe: 1, ps: 1, pb: 1, ev_ebit: 1, ev_ebitda: 1, ev_sales: 1 },
  },
  value: {
    label: 'Value Focused',
    description: 'Emphasize earnings-based valuation',
    weights: { pe: 3, ps: 1, pb: 1, ev_ebit: 3, ev_ebitda: 2, ev_sales: 1 },
  },
  growth: {
    label: 'Growth Focused',
    description: 'Emphasize sales-based valuation',
    weights: { pe: 1, ps: 3, pb: 1, ev_ebit: 1, ev_ebitda: 2, ev_sales: 2 },
  },
  quality: {
    label: 'Quality Focused',
    description: 'Blend of earnings and cash-flow proxies',
    weights: { pe: 2, ps: 1, pb: 1, ev_ebit: 3, ev_ebitda: 3, ev_sales: 1 },
  },
  custom: {
    label: 'Custom',
    description: 'User-defined weights (percentages, auto-normalized)',
    weights: { pe: 1, ps: 1, pb: 1, ev_ebit: 1, ev_ebitda: 1, ev_sales: 1 },
  },
} as const;

