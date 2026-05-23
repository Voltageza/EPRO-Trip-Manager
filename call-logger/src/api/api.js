const BASE = '/api';
const TOKEN_KEY = 'epro-auth-token';

async function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('Session expired — please log in again');
  }
  return res;
}

// ===== Auth =====

export async function checkAuthStatus() {
  const res = await fetch(`${BASE}/auth/status`);
  if (!res.ok) throw new Error('Failed to check auth status');
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

// ===== Customers =====

export async function fetchCustomers(search) {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await authFetch(`${BASE}/customers${params}`);
  if (!res.ok) throw new Error('Failed to fetch customers');
  return res.json();
}

export async function fetchCustomer(id) {
  const res = await authFetch(`${BASE}/customers/${id}`);
  if (!res.ok) throw new Error('Failed to fetch customer');
  return res.json();
}

export async function createCustomer(data) {
  const res = await authFetch(`${BASE}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to create customer');
  }
  return res.json();
}

export async function updateCustomer(id, data) {
  const res = await authFetch(`${BASE}/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update customer');
  return res.json();
}

export async function deleteCustomer(id) {
  const res = await authFetch(`${BASE}/customers/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to delete customer');
  }
  return res.json();
}

// ===== Jobs =====

export async function fetchJobs(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.assigned_to) params.set('assigned_to', filters.assigned_to);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  const res = await authFetch(`${BASE}/jobs${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export async function fetchJob(id) {
  const res = await authFetch(`${BASE}/jobs/${id}`);
  if (!res.ok) throw new Error('Failed to fetch job');
  return res.json();
}

export async function createJob(data) {
  const res = await authFetch(`${BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to create job');
  }
  return res.json();
}

export async function updateJob(id, data) {
  const res = await authFetch(`${BASE}/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update job');
  return res.json();
}

export async function deleteJob(id) {
  const res = await authFetch(`${BASE}/jobs/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete job');
  return res.json();
}

export async function resendWebhook(id) {
  const res = await authFetch(`${BASE}/jobs/${id}/resend-webhook`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to resend webhook');
  return res.json();
}

export async function uploadPhotos(jobId, files) {
  const formData = new FormData();
  for (const file of files) formData.append('photos', file);
  const res = await authFetch(`${BASE}/jobs/${jobId}/photos`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to upload photos');
  }
  return res.json();
}

export async function deletePhoto(jobId, photoId) {
  const res = await authFetch(`${BASE}/jobs/${jobId}/photos/${photoId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete photo');
  return res.json();
}

// ===== Linked Trips =====

export async function fetchLinkedTrips(jobId) {
  const res = await authFetch(`${BASE}/jobs/${jobId}/linked-trips`);
  if (!res.ok) throw new Error('Failed to fetch linked trips');
  return res.json();
}

// ===== Electricians =====

export async function fetchElectricians() {
  const res = await authFetch(`${BASE}/microsoft/electricians`);
  if (!res.ok) throw new Error('Failed to fetch electricians');
  return res.json();
}

export async function createElectrician(name, phone) {
  const res = await authFetch(`${BASE}/microsoft/electricians`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to add electrician');
  }
  return res.json();
}

export async function updateElectrician(id, fields) {
  const res = await authFetch(`${BASE}/microsoft/electricians/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to update electrician');
  }
  return res.json();
}

export async function deleteElectrician(id) {
  const res = await authFetch(`${BASE}/microsoft/electricians/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete electrician');
  return res.json();
}
