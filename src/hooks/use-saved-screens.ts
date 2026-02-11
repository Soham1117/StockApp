'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getSavedScreens,
  saveScreen,
  updateScreen,
  deleteScreen,
  getScreen,
  updateLastUsed,
  screenNameExists,
  type SavedScreen,
  type ScreenerFilters,
} from '@/lib/saved-screens-api';

export function useSavedScreens() {
  // Initialize with empty array to avoid SSR issues
  const [screens, setScreens] = useState<SavedScreen[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load screens from API on mount
  useEffect(() => {
    const loadScreens = async () => {
      try {
        setIsLoading(true);
        const data = await getSavedScreens();
        setScreens(data);
      } catch (error) {
        console.error('[useSavedScreens] Failed to load screens:', error);
        setScreens([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadScreens();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await getSavedScreens();
      setScreens(data);
    } catch (error) {
      console.error('[useSavedScreens] Failed to refresh screens:', error);
    }
  }, []);

  const save = useCallback(
    async (name: string, filters: ScreenerFilters): Promise<string> => {
      const exists = await screenNameExists(name);
      if (exists) {
        throw new Error('A screen with this name already exists');
      }

      const id = await saveScreen({ name, filters });
      await refresh();
      return id;
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, updates: Partial<Omit<SavedScreen, 'id' | 'createdAt'>>) => {
      await updateScreen(id, updates);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteScreen(id);
      await refresh();
    },
    [refresh]
  );

  const load = useCallback(
    async (id: string): Promise<ScreenerFilters | null> => {
      const screen = await getScreen(id);
      if (!screen) return null;

      await updateLastUsed(id);
      await refresh();
      return screen.filters;
    },
    [refresh]
  );

  const getById = useCallback(async (id: string): Promise<SavedScreen | null> => {
    return await getScreen(id);
  }, []);

  return {
    screens,
    save,
    update,
    remove,
    load,
    getById,
    refresh,
    isLoading,
  };
}
