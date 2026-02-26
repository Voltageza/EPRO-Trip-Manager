const BASE = '/api';
const TOKEN_KEY = 'epro-auth-token';

// Authenticated fetch wrapper — injects Bearer token, fires auth-expired on 401
async function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('Session expired — please log in again');
  }
  return res;
}

// ===== Auth API (no token needed) =====

export async function checkAuthStatus() {
  const res = await fetch(`${BASE}/auth/status`);
  if (!res.ok) throw new Error('Failed to check auth status');
  return res.json();
}

export async function setupApi(username, password, displayName, default_vehicle) {
  const res = await fetch(`${BASE}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, displayName, default_vehicle }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Setup failed');
  }
  return res.json();
}

export async function loginApi(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed');
  }
  return res.json();
}

// ===== Admin API =====

export async function fetchUsersApi() {
  const res = await authFetch(`${BASE}/admin/users`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function createUserApi(username, password, displayName, role, default_vehicle) {
  const res = await authFetch(`${BASE}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, displayName, role, default_vehicle }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create user');
  }
  return res.json();
}

export async function updateUserApi(id, fields) {
  const res = await authFetch(`${BASE}/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update user');
  }
  return res.json();
}

export async function deleteUserApi(id) {
  const res = await authFetch(`${BASE}/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete user');
  }
  return res.json();
}

// ===== Trip API =====

export async function fetchTrips(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await authFetch(`${BASE}/trips?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch trips: ${res.status}`);
  return res.json();
}

export async function fetchUnclaimedTrips(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await authFetch(`${BASE}/trips/unclaimed?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch unclaimed trips: ${res.status}`);
  return res.json();
}

export async function claimTrip(tripId) {
  const res = await authFetch(`${BASE}/trips/${tripId}/claim`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to claim trip: ${res.status}`);
  }
  return res.json();
}

export async function unclaimTrip(tripId) {
  const res = await authFetch(`${BASE}/trips/${tripId}/unclaim`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to release trip: ${res.status}`);
  }
  return res.json();
}

export async function saveDescription(tripId, description) {
  const res = await authFetch(`${BASE}/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_description: description }),
  });
  if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
  return res.json();
}

export async function updateTrip(tripId, fields) {
  const res = await authFetch(`${BASE}/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Failed to update trip: ${res.status}`);
  return res.json();
}

export async function addSpare(tripId, spareName, quantity) {
  const res = await authFetch(`${BASE}/trips/${tripId}/spares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spare_name: spareName, quantity }),
  });
  if (!res.ok) throw new Error(`Failed to add spare: ${res.status}`);
  return res.json();
}

export async function deleteSpare(tripId, spareId) {
  const res = await authFetch(`${BASE}/trips/${tripId}/spares/${spareId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete spare: ${res.status}`);
  return res.json();
}

export async function triggerSync(from, to, registrations) {
  const body = { from, to };
  if (registrations && registrations.length > 0) body.registrations = registrations;
  const res = await authFetch(`${BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Sync failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchVehiclesApi() {
  const res = await authFetch(`${BASE}/vehicles`);
  if (!res.ok) throw new Error(`Failed to fetch vehicles: ${res.status}`);
  return res.json();
}

export async function syncVehiclesApi() {
  const res = await authFetch(`${BASE}/vehicles/sync`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to sync vehicles: ${res.status}`);
  return res.json();
}

export async function updateVehicle(registration, fields) {
  const res = await authFetch(`${BASE}/vehicles/${encodeURIComponent(registration)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Failed to update vehicle: ${res.status}`);
  return res.json();
}

export async function submitDailyReport(date, notes) {
  const res = await authFetch(`${BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, notes }),
  });
  if (!res.ok) throw new Error(`Failed to submit report: ${res.status}`);
  return res.json();
}

export async function getDailyReport(date) {
  const res = await authFetch(`${BASE}/reports?date=${encodeURIComponent(date)}`);
  if (!res.ok) throw new Error(`Failed to get report: ${res.status}`);
  return res.json();
}

export async function mergeTrips(tripIds) {
  const res = await authFetch(`${BASE}/trips/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Merge failed: ${res.status}`);
  }
  return res.json();
}

// ===== Locations API =====

export async function fetchLocationsApi() {
  const res = await authFetch(`${BASE}/locations`);
  if (!res.ok) throw new Error('Failed to fetch locations');
  return res.json();
}

export async function createLocationApi(name, lat, lng) {
  const res = await authFetch(`${BASE}/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, lat, lng }),
  });
  if (!res.ok) throw new Error('Failed to create location');
  return res.json();
}

export async function deleteLocationApi(id) {
  const res = await authFetch(`${BASE}/locations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete location');
  return res.json();
}

// ===== Job Linking API =====

export async function fetchOpenJobs() {
  const res = await authFetch(`${BASE}/jobs/open/list`);
  if (!res.ok) throw new Error('Failed to fetch open jobs');
  return res.json();
}

export async function linkTripToJob(jobId, tripId, complete = false) {
  const res = await authFetch(`${BASE}/jobs/${jobId}/link-trip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trip_id: tripId, complete }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to link trip');
  }
  return res.json();
}

export async function unlinkTripFromJob(jobId, tripId) {
  const res = await authFetch(`${BASE}/jobs/${jobId}/unlink-trip/${tripId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to unlink trip');
  return res.json();
}

// ===== Weekly Report API =====

export async function previewWeeklyReport(from, to) {
  const res = await authFetch(`${BASE}/reports/preview-weekly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to generate preview');
  }
  return res.json();
}

export async function sendWeeklyReportApi(from, to, html) {
  const res = await authFetch(`${BASE}/reports/send-weekly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, html }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to send report');
  }
  return res.json();
}

export async function unmergeTrip(tripId) {
  const res = await authFetch(`${BASE}/trips/${tripId}/unmerge`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Unmerge failed: ${res.status}`);
  }
  return res.json();
}
