import React from 'react';

export default function StatusBar({ message, type }) {
  if (!message) return null;
  return (
    <div className={`status-bar status-${type || 'info'}`}>
      {message}
    </div>
  );
}
