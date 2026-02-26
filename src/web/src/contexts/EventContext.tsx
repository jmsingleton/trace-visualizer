import React, { createContext, useContext, useEffect, useState } from 'react';
import type { TraceEvent, SessionStats } from '../../../shared/types';

interface EventContextValue {
  events: TraceEvent[];
  stats: SessionStats | null;
  connected: boolean;
  latestEvent: TraceEvent | null;
}

const EventContext = createContext<EventContextValue>({
  events: [], stats: null, connected: false, latestEvent: null,
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [connected, setConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<TraceEvent | null>(null);

  useEffect(() => {
    // Check for snapshot data (HTML export replay mode)
    const snap = (window as Record<string, unknown>).__TRACE_VIZ_SNAPSHOT__ as
      { events: TraceEvent[]; stats: SessionStats } | undefined;
    if (snap) {
      setEvents(snap.events);
      setStats(snap.stats);
      return;
    }

    const ws = new WebSocket(`ws://${window.location.host}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as
        TraceEvent | { type: 'snapshot'; events: TraceEvent[]; stats: SessionStats };
      if (msg.type === 'snapshot') {
        setEvents((msg as { type: 'snapshot'; events: TraceEvent[]; stats: SessionStats }).events);
        setStats((msg as { type: 'snapshot'; events: TraceEvent[]; stats: SessionStats }).stats);
      } else {
        const event = msg as TraceEvent;
        setEvents(prev => [...prev, event]);
        setLatestEvent(event);
        // Refresh stats from daemon after each event
        fetch(`http://${window.location.host}/stats`)
          .then(r => r.json())
          .then(s => setStats(s as SessionStats))
          .catch(() => { /* daemon may not be running */ });
      }
    };
    return () => ws.close();
  }, []);

  return (
    <EventContext.Provider value={{ events, stats, connected, latestEvent }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvents = () => useContext(EventContext);
