import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { fetchOpenJobs, linkTripToJob, unlinkTripFromJob } from '../api/tripsApi.js';

export default function JobLinker({ trip, onUpdate, onTripsReload }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const sectionRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const linkedJob = trip.linked_job;

  useEffect(() => {
    if (!showDropdown) return;
    setLoading(true);
    fetchOpenJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [showDropdown]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        sectionRef.current && !sectionRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  function updatePosition() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width,
      });
    }
  }

  // Keep dropdown anchored to the button while scrolling / resizing
  useEffect(() => {
    if (!showDropdown) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showDropdown]);

  function handleOpenDropdown() {
    if (!showDropdown && buttonRef.current) {
      updatePosition();
    }
    setShowDropdown(s => !s);
  }

  async function handleLink(jobId, complete) {
    setLinking(true);
    try {
      await linkTripToJob(jobId, trip.id, complete);
      setShowDropdown(false);
      onTripsReload();
    } catch (err) {
      alert(err.message);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink() {
    if (!linkedJob) return;
    try {
      await unlinkTripFromJob(linkedJob.id, trip.id);
      onTripsReload();
    } catch (err) {
      alert(err.message);
    }
  }

  const filtered = jobs.filter(j => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      j.reference_number.toLowerCase().includes(term) ||
      (j.customer_name || '').toLowerCase().includes(term) ||
      (j.description || '').toLowerCase().includes(term)
    );
  });

  // If trip is already linked to a job, show the badge
  if (linkedJob) {
    return (
      <div className="job-link-section" onClick={e => e.stopPropagation()}>
        <div className={`job-link-badge job-link-${linkedJob.status}`}>
          <span className="job-link-ref">{linkedJob.reference_number}</span>
          {linkedJob.customer_name && (
            <span className="job-link-customer">{linkedJob.customer_name}</span>
          )}
          <span className={`job-link-status`}>
            {linkedJob.status === 'complete' ? '\u2713' : linkedJob.status.replace('_', ' ')}
          </span>
          <button
            className="job-unlink-btn"
            title="Unlink this job"
            onClick={handleUnlink}
          >&times;</button>
        </div>
      </div>
    );
  }

  const dropdown = showDropdown && ReactDOM.createPortal(
    <div
      className="job-link-dropdown"
      ref={dropdownRef}
      style={{ position: 'fixed', zIndex: 9999, ...dropdownStyle }}
      onClick={e => e.stopPropagation()}
    >
      <input
        type="text"
        className="job-link-search"
        placeholder="Search jobs..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      {loading ? (
        <div className="job-link-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="job-link-empty">No open jobs found</div>
      ) : (
        <div className="job-link-list">
          {filtered.map(job => (
            <div key={job.id} className="job-link-item">
              <div className="job-link-item-info">
                <span className="job-link-item-ref">{job.reference_number}</span>
                {job.customer_name && (
                  <span className="job-link-item-customer">{job.customer_name}</span>
                )}
                {job.description && (
                  <span className="job-link-item-desc">{job.description}</span>
                )}
              </div>
              <div className="job-link-item-actions">
                <button
                  className="job-link-action"
                  onClick={() => handleLink(job.id, false)}
                  disabled={linking}
                  title="Link without completing"
                >Link</button>
                <button
                  className="job-link-action complete"
                  onClick={() => handleLink(job.id, true)}
                  disabled={linking}
                  title="Link and mark job as complete"
                >Complete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );

  return (
    <div className="job-link-section" ref={sectionRef} onClick={e => e.stopPropagation()}>
      <button
        className="job-link-btn"
        ref={buttonRef}
        onClick={handleOpenDropdown}
      >
        Link to Job
      </button>
      {dropdown}
    </div>
  );
}
