import React from 'react';

export default function DatePicker({ value, onChange }) {
  return (
    <input
      type="date"
      className="date-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
