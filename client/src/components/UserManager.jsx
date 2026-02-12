import React, { useState, useEffect } from 'react';
import { fetchUsersApi, createUserApi, updateUserApi, deleteUserApi, fetchVehiclesApi } from '../api/tripsApi.js';

export default function UserManager({ onClose }) {
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newVehicle, setNewVehicle] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset password state
  const [resetId, setResetId] = useState(null);
  const [resetPw, setResetPw] = useState('');

  const loadUsers = async () => {
    try {
      const data = await fetchUsersApi();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    fetchVehiclesApi().then(setVehicles).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createUserApi(newUsername, newPassword, newDisplayName, newRole, newVehicle || undefined);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('user');
      setNewVehicle('');
      setShowCreate(false);
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await updateUserApi(user.id, { is_active: user.is_active ? 0 : 1 });
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await deleteUserApi(user.id);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await updateUserApi(resetId, { password: resetPw });
      setResetId(null);
      setResetPw('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="user-manager-overlay" onClick={onClose}>
      <div className="user-manager" onClick={e => e.stopPropagation()}>
        <div className="um-header">
          <h2>Manage Users</h2>
          <button className="um-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="login-error" style={{ margin: '0 1.25rem' }}>{error}</div>}

        <div className="um-body">
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : (
            <table className="um-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Role</th>
                  <th>Default Vehicle</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className={u.is_active ? '' : 'um-disabled'}>
                    <td>{u.username}</td>
                    <td>{u.display_name}</td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                    <td>
                      <select
                        value={u.default_vehicle || ''}
                        onChange={async (e) => {
                          try {
                            await updateUserApi(u.id, { default_vehicle: e.target.value || null });
                            loadUsers();
                          } catch (err) { setError(err.message); }
                        }}
                        className="um-vehicle-select"
                      >
                        <option value="">All vehicles</option>
                        {vehicles.filter(v => v.is_active).map(v => (
                          <option key={v.registration} value={v.registration}>
                            {v.description || v.registration}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{u.is_active ? 'Active' : 'Disabled'}</td>
                    <td className="um-actions">
                      <button onClick={() => handleToggleActive(u)} className="um-btn">
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => { setResetId(u.id); setResetPw(''); }} className="um-btn">
                        Reset PW
                      </button>
                      <button onClick={() => handleDelete(u)} className="um-btn um-btn-danger">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {resetId && (
            <form onSubmit={handleResetPassword} className="um-reset-form">
              <label>New password for user #{resetId}:</label>
              <div className="um-reset-row">
                <input
                  type="password"
                  value={resetPw}
                  onChange={e => setResetPw(e.target.value)}
                  minLength={4}
                  required
                  autoFocus
                />
                <button type="submit" className="um-btn">Save</button>
                <button type="button" className="um-btn" onClick={() => setResetId(null)}>Cancel</button>
              </div>
            </form>
          )}

          {!showCreate ? (
            <button className="um-create-btn" onClick={() => setShowCreate(true)}>
              + New User
            </button>
          ) : (
            <form onSubmit={handleCreate} className="um-create-form">
              <div className="login-field">
                <label>Username</label>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value)} required autoFocus />
              </div>
              <div className="login-field">
                <label>Display Name</label>
                <input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="Optional" />
              </div>
              <div className="login-field">
                <label>Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={4} />
              </div>
              <div className="login-field">
                <label>Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="login-field">
                <label>Default Vehicle</label>
                <select value={newVehicle} onChange={e => setNewVehicle(e.target.value)}>
                  <option value="">All vehicles</option>
                  {vehicles.filter(v => v.is_active).map(v => (
                    <option key={v.registration} value={v.registration}>
                      {v.description || v.registration}
                    </option>
                  ))}
                </select>
              </div>
              <div className="um-create-actions">
                <button type="submit" className="login-btn" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
                <button type="button" className="um-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
