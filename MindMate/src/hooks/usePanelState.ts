import { useState, useEffect, useCallback } from 'react';

export interface PanelStateOptions {
  storageKey?: string;
  defaultExpanded?: boolean;
  defaultMaximized?: boolean;
  defaultZoom?: number; // 80 - 125
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
}

export function usePanelState(options: PanelStateOptions = {}) {
  const {
    storageKey,
    defaultExpanded = true,
    defaultMaximized = false,
    defaultZoom = 100,
    minZoom = 80,
    maxZoom = 125,
    zoomStep = 10,
  } = options;

  // Initialize from localStorage if key provided
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined' || !storageKey) return defaultExpanded;
    try {
      const saved = localStorage.getItem(`${storageKey}_expanded`);
      return saved !== null ? saved === 'true' : defaultExpanded;
    } catch {
      return defaultExpanded;
    }
  });

  const [isMaximized, setIsMaximized] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined' || !storageKey) return defaultMaximized;
    try {
      const saved = localStorage.getItem(`${storageKey}_maximized`);
      return saved !== null ? saved === 'true' : defaultMaximized;
    } catch {
      return defaultMaximized;
    }
  });

  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    if (typeof localStorage === 'undefined' || !storageKey) return defaultZoom;
    try {
      const saved = localStorage.getItem(`${storageKey}_zoom`);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minZoom && parsed <= maxZoom) {
          return parsed;
        }
      }
      return defaultZoom;
    } catch {
      return defaultZoom;
    }
  });

  // Sync state to localStorage when changes occur
  useEffect(() => {
    if (typeof localStorage === 'undefined' || !storageKey) return;
    try {
      localStorage.setItem(`${storageKey}_expanded`, String(isExpanded));
      localStorage.setItem(`${storageKey}_maximized`, String(isMaximized));
      localStorage.setItem(`${storageKey}_zoom`, String(zoomLevel));
    } catch {}
  }, [storageKey, isExpanded, isMaximized, zoomLevel]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const toggleMaximized = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(maxZoom, prev + zoomStep));
  }, [maxZoom, zoomStep]);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(minZoom, prev - zoomStep));
  }, [minZoom, zoomStep]);

  const resetZoom = useCallback(() => {
    setZoomLevel(defaultZoom);
  }, [defaultZoom]);

  return {
    isExpanded,
    setIsExpanded,
    toggleExpanded,
    isMaximized,
    setIsMaximized,
    toggleMaximized,
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    canZoomIn: zoomLevel < maxZoom,
    canZoomOut: zoomLevel > minZoom,
    isDefaultZoom: zoomLevel === defaultZoom,
  };
}
