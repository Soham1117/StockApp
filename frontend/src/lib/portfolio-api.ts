/**
 * Portfolio API client - replaces localStorage with backend API
 */
export interface PortfolioHolding {
  id?: number;
  symbol: string;
  shares: number;
  averageCost: number;
  purchaseDate: string; // ISO date string
  addedAt: string; // ISO date string
}

export interface Portfolio {
  holdings: PortfolioHolding[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Get user ID (for now, using a simple approach - can be enhanced with auth later)
 */
function getUserId(): string {
  if (typeof window === 'undefined') return 'default';
  let userId = localStorage.getItem('quantdash-user-id');
  if (!userId) {
    userId = `user-${Date.now()}`;
    localStorage.setItem('quantdash-user-id', userId);
  }
  return userId;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const userId = getUserId();
  // Route through Next.js API proxy (server-side handles FASTAPI_BASE_URL)
  const url = `/api${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API error: ${response.statusText}`);
  }

  return response.json();
}

export async function getPortfolio(): Promise<Portfolio> {
  const data = await apiRequest<{ holdings: PortfolioHolding[]; createdAt: string; updatedAt: string }>(
    '/portfolio/holdings'
  );
  return {
    holdings: data.holdings || [],
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

export async function addHolding(
  holding: Omit<PortfolioHolding, 'id' | 'addedAt'>
): Promise<PortfolioHolding> {
  return apiRequest<PortfolioHolding>('/portfolio/holdings', {
    method: 'POST',
    body: JSON.stringify({
      symbol: holding.symbol,
      shares: holding.shares,
      averageCost: holding.averageCost,
      purchaseDate: holding.purchaseDate,
    }),
  });
}

export async function updateHolding(
  symbol: string,
  updates: Partial<Omit<PortfolioHolding, 'symbol' | 'id' | 'addedAt'>>
): Promise<PortfolioHolding> {
  return apiRequest<PortfolioHolding>(`/portfolio/holdings/${encodeURIComponent(symbol)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function removeHolding(symbol: string): Promise<void> {
  await apiRequest(`/portfolio/holdings/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
  });
}

export async function clearPortfolio(): Promise<void> {
  await apiRequest('/portfolio/holdings', {
    method: 'DELETE',
  });
}

export async function getHolding(symbol: string): Promise<PortfolioHolding | null> {
  const portfolio = await getPortfolio();
  return portfolio.holdings.find(
    (h) => h.symbol.toUpperCase() === symbol.toUpperCase()
  ) || null;
}

export async function hasHolding(symbol: string): Promise<boolean> {
  const holding = await getHolding(symbol);
  return holding !== null;
}

export async function getPortfolioSymbols(): Promise<string[]> {
  const portfolio = await getPortfolio();
  return portfolio.holdings.map((h) => h.symbol.toUpperCase());
}
