import React, { useState } from 'react';
import { triggerSync } from '../api/tripsApi.js';

export default function SyncButton({ date, onSynced }) {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await triggerSync(date, date);
      onSynced(result);
    } catch (err) {
      onSynced({ error: err.message });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button className="sync-btn" onClick={handleSync} disabled={syncing}>
      {syncing ? 'Syncing...' : 'Sync from Cartrack'}
    </button>
  );
}
