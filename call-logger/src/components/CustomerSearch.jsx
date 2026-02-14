import React, { useState, useEffect, useRef } from 'react';
import { fetchCustomers, createCustomer } from '../api/api.js';

export default function CustomerSearch({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await fetchCustomers(query);
        setResults(list);
        setShowDropdown(true);
      } catch {}
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const selectCustomer = (customer) => {
    onChange(customer);
    setQuery(customer.name);
    setShowDropdown(false);
  };

  const handleCreateNew = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const customer = await createCustomer({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        address: newAddress.trim() || undefined,
      });
      selectCustomer(customer);
      setShowNew(false);
      setNewName('');
      setNewPhone('');
      setNewAddress('');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const clearSelection = () => {
    onChange(null);
    setQuery('');
    setResults([]);
  };

  // If a customer is selected, show it as a chip
  if (value) {
    return (
      <div className="customer-selected">
        <span className="customer-chip">
          <strong>{value.name}</strong>
          {value.phone && <span className="customer-chip-phone">{value.phone}</span>}
          <button type="button" className="customer-chip-clear" onClick={clearSelection}>&times;</button>
        </span>
      </div>
    );
  }

  return (
    <div className="customer-search" ref={wrapperRef}>
      <input
        type="text"
        placeholder="Search customers by name, phone, or address..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => query.trim() && results.length > 0 && setShowDropdown(true)}
      />

      {showDropdown && (
        <div className="customer-dropdown">
          {results.length > 0 ? (
            results.slice(0, 8).map(c => (
              <button
                key={c.id}
                type="button"
                className="customer-option"
                onClick={() => selectCustomer(c)}
              >
                <span className="customer-option-name">{c.name}</span>
                {c.phone && <span className="customer-option-detail">{c.phone}</span>}
                {c.address && <span className="customer-option-detail">{c.address}</span>}
              </button>
            ))
          ) : (
            <div className="customer-no-results">No customers found</div>
          )}
          <button
            type="button"
            className="customer-add-new"
            onClick={() => { setShowNew(true); setShowDropdown(false); setNewName(query); }}
          >
            + Add new customer
          </button>
        </div>
      )}

      {showNew && (
        <div className="customer-new-form">
          <div className="customer-new-header">
            <strong>New Customer</strong>
            <button type="button" onClick={() => setShowNew(false)}>&times;</button>
          </div>
          <div className="customer-new-fields">
            <input
              type="text"
              placeholder="Customer name *"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <input
              type="text"
              placeholder="Phone number"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
            />
            <input
              type="text"
              placeholder="Address"
              value={newAddress}
              onChange={e => setNewAddress(e.target.value)}
            />
            <button type="button" disabled={saving || !newName.trim()} onClick={handleCreateNew}>
              {saving ? 'Saving...' : 'Create Customer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
