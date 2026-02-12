import React, { useState, useEffect } from 'react';

const ICONS = {
  info: '\u2139\uFE0F',
  success: '\u2705',
  error: '\u274C',
  warning: '\u26A0\uFE0F',
};

export default function StatusBar({ message, type }) {
  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState('');
  const [displayType, setDisplayType] = useState('info');

  useEffect(() => {
    if (message) {
      setDisplay(message);
      setDisplayType(type || 'info');
      setVisible(true);

      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [message, type]);

  if (!visible) return null;

  return (
    <div className="toast-container">
      <div className={`toast toast-${displayType}`}>
        <span className="toast-icon">{ICONS[displayType] || ICONS.info}</span>
        <span>{display}</span>
        <button className="toast-dismiss" onClick={() => setVisible(false)}>{'\u2715'}</button>
      </div>
    </div>
  );
}
