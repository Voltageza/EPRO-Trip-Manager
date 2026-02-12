import React, { useState } from 'react';
import { syncVehiclesApi, updateVehicle } from '../api/tripsApi.js';

export default function VehicleSelector({ vehicles, selectedVehicles, onSelectionChange, onVehiclesRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await syncVehiclesApi();
      onVehiclesRefresh(result.vehicles || []);
    } catch (err) {
      console.error('Vehicle sync failed:', err.message);
    } finally {
      setRefreshing(false);
    }
  }

  function handleToggle(reg) {
    const next = new Set(selectedVehicles);
    if (next.has(reg)) {
      next.delete(reg);
    } else {
      next.add(reg);
    }
    onSelectionChange([...next]);
  }

  function handleSelectAll() {
    onSelectionChange(vehicles.map(v => v.registration));
  }

  function handleSelectNone() {
    onSelectionChange([]);
  }

  if (vehicles.length === 0) {
    return (
      <div className="vehicle-selector">
        <div className="vehicle-empty">
          No vehicles loaded.
          <button className="vehicle-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Loading...' : 'Fetch from Cartrack'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vehicle-selector">
      <div className="vehicle-actions">
        <button className="vehicle-action-btn" onClick={handleSelectAll}>All</button>
        <button className="vehicle-action-btn" onClick={handleSelectNone}>None</button>
        <button
          className="vehicle-action-btn refresh"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh vehicle list from Cartrack"
        >
          {refreshing ? '\u23F3' : '\u21BB'}
        </button>
      </div>
      <div className="vehicle-list">
        {vehicles.map(v => (
          <label key={v.registration} className="vehicle-item">
            <input
              type="checkbox"
              checked={selectedVehicles.includes(v.registration)}
              onChange={() => handleToggle(v.registration)}
            />
            <span className="vehicle-reg">{v.registration}</span>
            {v.description && <span className="vehicle-desc">{v.description}</span>}
          </label>
        ))}
      </div>
      <div className="vehicle-count">
        {selectedVehicles.length} of {vehicles.length} selected
      </div>
    </div>
  );
}
