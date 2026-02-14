import React, { useState, useEffect } from 'react';
import { fetchElectricians, createElectrician, updateElectrician, deleteElectrician } from '../api/api.js';

export default function ElectricianManager({ onBack }) {
  const [electricians, setElectricians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    fetchElectricians()
      .then(setElectricians)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setError('');
    setAdding(true);
    try {
      const elec = await createElectrician(newName.trim(), newPhone.trim() || undefined);
      setElectricians(prev => [...prev, elec].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewPhone('');
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const startEdit = (elec) => {
    setEditingId(elec.id);
    setEditName(elec.name);
    setEditPhone(elec.phone || '');
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    setError('');
    try {
      const updated = await updateElectrician(editingId, {
        name: editName.trim(),
        phone: editPhone.trim() || null,
      });
      setElectricians(prev => prev.map(e => e.id === editingId ? updated : e));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Remove ${name} from the electricians list?`)) return;
    try {
      await deleteElectrician(id);
      setElectricians(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="elec-manager">
      <div className="elec-header">
        <div>
          <h2>Electricians</h2>
          <p className="elec-subtitle">Manage the list of electricians available for job assignment.</p>
        </div>
        <button className="btn-text" onClick={onBack}>&larr; Back to calls</button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="elec-add-row">
        <input
          type="text"
          placeholder="Electrician name *"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <input
          type="text"
          placeholder="Phone (optional)"
          value={newPhone}
          onChange={e => setNewPhone(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-primary" onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? 'Adding...' : 'Add'}
        </button>
      </div>

      {loading ? (
        <div className="elec-loading"><div className="spinner" /></div>
      ) : electricians.length === 0 ? (
        <div className="elec-empty">
          <p>No electricians added yet. Add your team above.</p>
        </div>
      ) : (
        <div className="elec-list">
          {electricians.map(elec => (
            <div key={elec.id} className="elec-item">
              {editingId === elec.id ? (
                <div className="elec-edit-row">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                  />
                  <button className="btn-primary" onClick={saveEdit}>Save</button>
                  <button className="btn-text" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="elec-info">
                    <strong>{elec.name}</strong>
                    {elec.phone && <span className="elec-phone">{elec.phone}</span>}
                  </div>
                  <div className="elec-actions">
                    <button className="btn-text" onClick={() => startEdit(elec)}>Edit</button>
                    <button className="btn-danger-text" onClick={() => handleDelete(elec.id, elec.name)}>Remove</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
