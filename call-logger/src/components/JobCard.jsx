import React from 'react';

const STATUS_LABELS = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  complete: 'Complete',
  incomplete: 'Incomplete',
};

const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  urgent: 'Urgent',
};

export default function JobCard({ job, onClick }) {
  const createdDate = new Date(job.created_at).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const createdTime = new Date(job.created_at).toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`job-card job-card--${job.status}`} onClick={() => onClick(job)}>
      <div className="job-card-header">
        {job.customer_name && (
          <div className="job-customer-name">
            {job.customer_name}
            {job.customer_phone && <span className="job-customer-phone"> &middot; {job.customer_phone}</span>}
            {job.customer_address && <span className="job-customer-address"> &middot; {job.customer_address}</span>}
          </div>
        )}
        <div className="job-badges">
          {job.priority !== 'normal' && (
            <span className={`badge badge-priority-${job.priority}`}>
              {PRIORITY_LABELS[job.priority]}
            </span>
          )}
          <span className={`badge badge-status-${job.status}`}>
            {STATUS_LABELS[job.status]}
          </span>
        </div>
      </div>

      <div className="job-card-body">
        <span className="job-ref">{job.reference_number}</span>
        <div className="job-description">{job.description}</div>
      </div>

      <div className="job-card-footer">
        <span className="job-meta">
          {createdDate} {createdTime}
          {job.created_by_name && <> &middot; {job.created_by_name}</>}
        </span>
        {job.assigned_to && (
          <span className="job-driver-badge">{job.assigned_to}</span>
        )}
      </div>
    </div>
  );
}
