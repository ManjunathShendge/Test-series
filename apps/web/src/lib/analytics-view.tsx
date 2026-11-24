'use client';

import { useEffect } from 'react';
import { track, type ClientAnalyticsEvent } from './analytics';

/** Records one page-view event from a server-rendered page. Renders nothing. */
export function TrackView({ event }: { event: ClientAnalyticsEvent }) {
  useEffect(() => track(event), [event]);
  return null;
}
