import React, { useState } from 'react';
import { updateTrip } from '../api/tripsApi.js';

export default function BusinessToggle({ trip, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const isBusiness = trip.is_business !== 0;

  async function handleToggle() {
    setSaving(true);
    try {
      const updated = await updateTrip(trip.id, { is_business: isBusiness ? 0 : 1 });
      onUpdate(updated);
    } catch {
      // keep current state on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      className={`business-toggle ${isBusiness ? 'is-business' : 'is-private'}`}
      onClick={handleToggle}
      disabled={saving}
      title={isBusiness ? 'Click to mark as Private' : 'Click to mark as Business'}
    >
      <span className="toggle-option business">Business</span>
      <span className="toggle-option private">Private</span>
    </button>
  );
}
