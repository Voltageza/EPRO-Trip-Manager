import React, { useState } from 'react';
import { addSpare, deleteSpare } from '../api/tripsApi.js';

export default function SparesInput({ trip, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [saving, setSaving] = useState(false);

  const spares = trip.spares || [];

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const spare = await addSpare(trip.id, name.trim(), parseInt(quantity, 10) || 1);
      onUpdate({ ...trip, spares: [...spares, spare] });
      setName('');
      setQuantity('1');
      setShowForm(false);
    } catch {
      // keep form open on error
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(spareId) {
    try {
      await deleteSpare(trip.id, spareId);
      onUpdate({ ...trip, spares: spares.filter(s => s.id !== spareId) });
    } catch {
      // silent fail
    }
  }

  return (
    <div className="spares-section">
      {spares.length > 0 && (
        <div className="spares-list">
          {spares.map(s => (
            <span key={s.id} className="spare-chip">
              {s.spare_name} <span className="spare-qty">x{s.quantity}</span>
              <button
                className="spare-remove"
                onClick={() => handleRemove(s.id)}
                title="Remove spare"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {!showForm ? (
        <button className="spare-add-btn" onClick={() => setShowForm(true)}>
          + Add Spare
        </button>
      ) : (
        <form className="spare-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Spare name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="spare-qty-input"
          />
          <button type="submit" disabled={saving || !name.trim()}>
            {saving ? '...' : 'Add'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="spare-cancel">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
