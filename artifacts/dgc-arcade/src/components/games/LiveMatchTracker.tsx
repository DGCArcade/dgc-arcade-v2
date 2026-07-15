import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface MatchTrackerProps {
  fixtureId: string;
  providerWidgetId?: string; // Optional: For Sportradar/LSports packages if integrated later
}

export const LiveMatchTracker: React.FC<MatchTrackerProps> = ({ fixtureId, providerWidgetId }) => {
  const [matchEvent, setMatchEvent] = useState<any>(null);

  useEffect(() => {
    // Connect to your WebSocket microservice engine 
    // In production, this would be your API server URL
    const socket: Socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket']
    });

    socket.emit('sportsbook:subscribe', { fixtureId });

    socket.on(`match-tracker:${fixtureId}:update`, (eventPayload) => {
      setMatchEvent(eventPayload); // Structure: { coordinates: { x: 42, y: 71 }, eventText: "Attacking Third" }
    });

    // Fallback: Listen to general odds updates if specific tracker isn't available
    socket.on('sportsbook:odds:update', (snapshot) => {
      const fixture = snapshot.fixtures.find((f: any) => f.id === fixtureId);
      if (fixture && fixture.live_details) {
        setMatchEvent(fixture.live_details);
      }
    });

    return () => {
      socket.off(`match-tracker:${fixtureId}:update`);
      socket.off('sportsbook:odds:update');
      socket.disconnect();
    };
  }, [fixtureId]);

  return (
    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl p-4 text-white">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold tracking-wide text-sm text-slate-400 uppercase">Live Game Visualizer</h3>
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </div>

      {/* 2D Pitch Field Container Wrap */}
      <div className="relative w-full h-64 bg-emerald-800 border-2 border-white/20 rounded-lg overflow-hidden flex items-center justify-center">
        {/* Pitch Tactical Marking Line Layout Grid */}
        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/20" />
        <div className="absolute w-24 h-24 border-2 border-white/20 rounded-full" />
        
        {/* Live Vector Ball Tracker Anchor Object */}
        {matchEvent?.coordinates && (
          <div 
            className="absolute w-4 h-4 bg-yellow-400 rounded-full shadow-lg transition-all duration-700 ease-out flex items-center justify-center border border-black"
            style={{ 
              left: `${matchEvent.coordinates.x}%`, 
              top: `${matchEvent.coordinates.y}%` 
            }}
          >
            <div className="w-1.5 h-1.5 bg-black rounded-full" />
          </div>
        )}

        {/* Live Telemetry Display Overlays */}
        <div className="absolute bottom-2 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded text-xs">
          Event: <span className="text-yellow-400 font-mono font-medium">{matchEvent?.eventText || 'Live Match Tracking...'}</span>
        </div>
      </div>
    </div>
  );
};
