import React, { useState, useEffect } from 'react';
import JobCard from './JobCard.jsx';
import { fetchJobs, fetchElectricians } from '../api/api.js';

export default function JobList({ onSelectJob, onNewJob, refreshKey }) {
  const [jobs, setJobs] = useState([]);
  const [electricians, setElectricians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [electricianFilter, setElectricianFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    fetchElectricians()
      .then(setElectricians)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchJobs({
      status: statusFilter || undefined,
      assigned_to: electricianFilter || undefined,
      search: search || undefined,
    })
      .then(data => { if (!cancelled) setJobs(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statusFilter, electricianFilter, search, refreshKey]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const activeCount = jobs.filter(j => !['complete', 'incomplete'].includes(j.status)).length;

  return (
    <div className="job-list-container">
      <div className="job-list-header">
        <div className="job-list-title">
          <h2>Service Calls</h2>
          <span className="job-count">{activeCount} active</span>
        </div>
        <button className="btn-primary" onClick={onNewJob}>+ New Call</button>
      </div>

      <div className="job-filters">
        <form onSubmit={handleSearchSubmit} className="filter-search">
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn-search">Search</button>
          {search && (
            <button type="button" className="btn-text" onClick={() => { setSearch(''); setSearchInput(''); }}>
              Clear
            </button>
          )}
        </form>

        <div className="filter-selects">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
          </select>

          <select value={electricianFilter} onChange={e => setElectricianFilter(e.target.value)}>
            <option value="">All Electricians</option>
            {electricians.map(e => (
              <option key={e.id} value={e.name}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="job-list-loading"><div className="spinner" /></div>
      ) : jobs.length === 0 ? (
        <div className="job-list-empty">
          <p>No service calls found</p>
          {(statusFilter || electricianFilter || search) && (
            <button className="btn-text" onClick={() => {
              setStatusFilter('');
              setElectricianFilter('');
              setSearch('');
              setSearchInput('');
            }}>Clear filters</button>
          )}
        </div>
      ) : (
        <div className="job-list">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onClick={onSelectJob} />
          ))}
        </div>
      )}
    </div>
  );
}
