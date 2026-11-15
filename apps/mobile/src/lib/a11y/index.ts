import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the system reduce-motion preference so animated components can fall
 * back to instant state changes. Resolves asynchronously; defaults to false.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

/** Announces a complete, contextual phrase without moving focus. */
export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}
