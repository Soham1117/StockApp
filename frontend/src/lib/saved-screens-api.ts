/**
 * Saved screens API client - replaces localStorage with backend API
 */
import { env } from './env';

export interface CustomRule {
  id: string;
  metric: string;
  operator: '<' | '>' | '=' | '!=' | 'between' | '>=' | '<=';
  value: number | [number, number];
  enabled: boolean;
}

export interface ScreenerFilters {
  country?: string;
  industry?: string;
  cap?: 'large' | 'mid' | 'small' | 'all';
  customRules?: CustomRule[];
  ruleLogic?: 'AND' | 'OR';
}

export interface SavedScreen {
  id: string;
  name: string;
  filters: ScreenerFilters;
  createdAt: string; // ISO date string
  lastUsed: string; // ISO date string
}

const API_BASE_URL = env.fastapiBaseUrl || 'http://localhost:8000';

/**
 * Get user ID (for now, using a simple approach - can be enhanced with auth later)
 */
function getUserId(): string {
  if (typeof window === 'undefined') return 'default';
  // For now, use a simple localStorage key for user ID
  // In production, this would come from auth token/session
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
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
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

export async function getSavedScreens(): Promise<SavedScreen[]> {
  const data = await apiRequest<{ screens: SavedScreen[] }>('/saved-screens');
  return data.screens || [];
}

export async function saveScreen(
  screen: Omit<SavedScreen, 'id' | 'createdAt' | 'lastUsed'>
): Promise<string> {
  const result = await apiRequest<SavedScreen>('/saved-screens', {
    method: 'POST',
    body: JSON.stringify({
      name: screen.name,
      filters: screen.filters,
    }),
  });
  return result.id;
}

export async function updateScreen(
  id: string,
  updates: Partial<Omit<SavedScreen, 'id' | 'createdAt'>>
): Promise<void> {
  await apiRequest(`/saved-screens/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteScreen(id: string): Promise<void> {
  await apiRequest(`/saved-screens/${id}`, {
    method: 'DELETE',
  });
}

export async function getScreen(id: string): Promise<SavedScreen | null> {
  try {
    return await apiRequest<SavedScreen>(`/saved-screens/${id}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

export async function updateLastUsed(id: string): Promise<void> {
  // Last used is updated automatically when getting a screen
  // But we can also call getScreen to trigger it
  await getScreen(id);
}

export async function screenNameExists(name: string, excludeId?: string): Promise<boolean> {
  const screens = await getSavedScreens();
  return screens.some(
    (s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== excludeId
  );
}
