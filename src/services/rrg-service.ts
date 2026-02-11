import { env } from "@/lib/env";

export interface RRGHistoryPoint {
  symbol: string;
  date: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: string;
  lookback_days: number;
}

export interface RRGHistoryResponse {
  benchmark: string;
  lookback_days: number;
  interval: string;
  start_date: string;
  end_date: string;
  symbols: string[];
  total_points: number;
  data: RRGHistoryPoint[];
}

/**
 * Fetch historical RRG data from FastAPI
 */
export async function getRRGHistory(params: {
  symbols?: string;
  startDate?: string;
  endDate?: string;
  lookbackDays?: number;
}): Promise<RRGHistoryResponse> {
  if (!env.fastapiBaseUrl) {
    throw new Error("FASTAPI_BASE_URL not configured");
  }

  const queryParams = new URLSearchParams({
    lookback_days: (params.lookbackDays ?? 180).toString(),
  });

  if (params.symbols) queryParams.set("symbols", params.symbols);
  if (params.startDate) queryParams.set("start_date", params.startDate);
  if (params.endDate) queryParams.set("end_date", params.endDate);

  const response = await fetch(
    `${env.fastapiBaseUrl}/rrg/history?${queryParams.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch RRG history: ${response.status} ${text}`);
  }

  return (await response.json()) as RRGHistoryResponse;
}
