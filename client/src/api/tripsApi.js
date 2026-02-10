const BASE = '/api';

export async function fetchTrips(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`${BASE}/trips?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch trips: ${res.status}`);
  return res.json();
}

export async function saveDescription(tripId, description) {
  const res = await fetch(`${BASE}/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_description: description }),
  });
  if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
  return res.json();
}

export async function updateTrip(tripId, fields) {
  const res = await fetch(`${BASE}/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Failed to update trip: ${res.status}`);
  return res.json();
}

export async function addSpare(tripId, spareName, quantity) {
  const res = await fetch(`${BASE}/trips/${tripId}/spares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spare_name: spareName, quantity }),
  });
  if (!res.ok) throw new Error(`Failed to add spare: ${res.status}`);
  return res.json();
}

export async function deleteSpare(tripId, spareId) {
  const res = await fetch(`${BASE}/trips/${tripId}/spares/${spareId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete spare: ${res.status}`);
  return res.json();
}

export async function triggerSync(from, to) {
  const res = await fetch(`${BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Sync failed: ${res.status}`);
  }
  return res.json();
}

export async function submitDailyReport(date, notes) {
  const res = await fetch(`${BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, notes }),
  });
  if (!res.ok) throw new Error(`Failed to submit report: ${res.status}`);
  return res.json();
}

export async function getDailyReport(date) {
  const res = await fetch(`${BASE}/reports?date=${encodeURIComponent(date)}`);
  if (!res.ok) throw new Error(`Failed to get report: ${res.status}`);
  return res.json();
}
