import React, { useState } from 'react';
import { triggerSync } from '../api/tripsApi.js';

export default function SyncButton({ date, onSynced, selectedVehicles }) {
  const [syncing, setSyncing] = useState(false);

  const vehicleCount = selectedVehicles ? selectedVehicles.length : 0;

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await triggerSync(date, date, selectedVehicles);
      onSynced(result);
    } catch (err) {
      onSynced({ error: err.message });
    } finally {
      setSyncing(false);
    }
  }

  const label = vehicleCount > 0
    ? `Sync ${vehicleCount} vehicle${vehicleCount !== 1 ? 's' : ''}`
    : 'Sync from Cartrack';

  return (
    <button className="sync-btn" onClick={handleSync} disabled={syncing}>
      {syncing ? (
        <>
          <span className="sync-spinner" />
          Syncing...
        </>
      ) : (
        <>
          <span className="sync-icon">{'\u21BB'}</span>
          {label}
        </>
      )}
    </button>
  );
}
