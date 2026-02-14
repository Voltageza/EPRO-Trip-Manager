import React, { useState, useEffect } from 'react';
import { fetchJob, updateJob, deleteJob, uploadPhotos, deletePhoto, fetchElectricians, fetchLinkedTrips } from '../api/api.js';

const STATUS_OPTIONS = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'incomplete', label: 'Incomplete' },
];

export default function JobDetail({ jobId, onBack, onUpdated }) {
  const [job, setJob] = useState(null);
  const [electricians, setElectricians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [linkedTrips, setLinkedTrips] = useState([]);

  const loadJob = async () => {
    try {
      const data = await fetchJob(jobId);
      setJob(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
    fetchElectricians()
      .then(setElectricians)
      .catch(() => {});
    fetchLinkedTrips(jobId)
      .then(setLinkedTrips)
      .catch(() => {});
  }, [jobId]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleStatusChange = async (status) => {
    try {
      const updated = await updateJob(jobId, { status });
      setJob(prev => ({ ...prev, ...updated }));
      onUpdated?.();
      showToast(`Status changed to ${status}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAssign = async (assigned_to) => {
    try {
      const updated = await updateJob(jobId, { assigned_to: assigned_to || null });
      setJob(prev => ({ ...prev, ...updated }));
      onUpdated?.();
      showToast('Electrician updated');
    } catch (err) {
      alert(err.message);
    }
  };

  const startEditing = () => {
    setEditFields({
      description: job.description || '',
      special_instructions: job.special_instructions || '',
      priority: job.priority,
    });
    setEditing(true);
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const updated = await updateJob(jobId, editFields);
      setJob(prev => ({ ...prev, ...updated }));
      setEditing(false);
      onUpdated?.();
      showToast('Job updated');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadPhotos(jobId, files);
      await loadJob();
      showToast('Photos uploaded');
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await deletePhoto(jobId, photoId);
      setJob(prev => ({
        ...prev,
        photos: prev.photos.filter(p => p.id !== photoId),
      }));
      showToast('Photo deleted');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteJob = async () => {
    if (!confirm(`Delete job ${job.reference_number}? This cannot be undone.`)) return;
    try {
      await deleteJob(jobId);
      onUpdated?.();
      onBack();
    } catch (err) {
      alert(err.message);
    }
  };

  const buildWhatsAppLink = () => {
    const elec = electricians.find(e => e.name === job.assigned_to);
    if (!elec?.phone) return null;

    // Clean phone number: remove spaces/dashes, ensure country code
    let phone = elec.phone.replace(/[\s\-()]/g, '');
    if (phone.startsWith('0')) phone = '27' + phone.slice(1); // SA country code
    if (!phone.startsWith('+') && !phone.startsWith('27')) phone = '27' + phone;
    phone = phone.replace('+', '');

    const lines = [
      `*${job.reference_number}*`,
      '',
    ];
    if (job.customer_name) {
      lines.push(`*Customer:* ${job.customer_name}`);
      if (job.customer_phone) lines.push(`*Phone:* ${job.customer_phone}`);
      if (job.customer_address) lines.push(`*Address:* ${job.customer_address}`);
      lines.push('');
    }
    if (job.description) lines.push(`*Job:* ${job.description}`);
    if (job.special_instructions) lines.push(`*Instructions:* ${job.special_instructions}`);
    if (job.priority === 'urgent') lines.push('');
    if (job.priority === 'urgent') lines.push('⚠ *URGENT*');

    const text = encodeURIComponent(lines.join('\n'));
    return `https://wa.me/${phone}?text=${text}`;
  };

  if (loading) return <div className="job-detail-loading"><div className="spinner" /></div>;
  if (!job) return <div className="job-detail-error">Job not found</div>;

  const whatsappLink = job.assigned_to ? buildWhatsAppLink() : null;

  const createdDate = new Date(job.created_at).toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="job-detail">
      {toast && <div className="toast">{toast}</div>}

      <div className="job-detail-nav">
        <button className="btn-text" onClick={onBack}>&larr; Back to list</button>
        <button className="btn-danger-text" onClick={handleDeleteJob}>Delete Job</button>
      </div>

      <div className="job-detail-header">
        <div>
          <h2 className="job-detail-ref">{job.reference_number}</h2>
          <span className="job-detail-date">Created {createdDate}</span>
          {job.created_by_name && <span className="job-detail-by"> by {job.created_by_name}</span>}
        </div>
        <span className={`badge badge-lg badge-status-${job.status}`}>
          {STATUS_OPTIONS.find(s => s.value === job.status)?.label}
        </span>
      </div>

      {/* Customer info */}
      {job.customer_name && (
        <div className="detail-section">
          <h3>Customer</h3>
          <div className="detail-customer">
            <strong>{job.customer_name}</strong>
            {job.customer_phone && <div>Phone: {job.customer_phone}</div>}
            {job.customer_email && <div>Email: {job.customer_email}</div>}
            {job.customer_address && <div>Address: {job.customer_address}</div>}
          </div>
        </div>
      )}

      {/* Description & instructions */}
      <div className="detail-section">
        <div className="detail-section-header">
          <h3>Details</h3>
          {!editing && <button className="btn-text" onClick={startEditing}>Edit</button>}
        </div>

        {editing ? (
          <div className="detail-edit-form">
            <label>Description</label>
            <textarea
              value={editFields.description}
              onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))}
              rows={3}
            />
            <label>Special Instructions</label>
            <textarea
              value={editFields.special_instructions}
              onChange={e => setEditFields(f => ({ ...f, special_instructions: e.target.value }))}
              rows={2}
            />
            <label>Priority</label>
            <select
              value={editFields.priority}
              onChange={e => setEditFields(f => ({ ...f, priority: e.target.value }))}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="detail-edit-actions">
              <button className="btn-primary" onClick={saveEdits} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-text" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="detail-description">{job.description || 'No description'}</p>
            {job.special_instructions && (
              <div className="detail-instructions">
                <strong>Special Instructions:</strong>
                <p>{job.special_instructions}</p>
              </div>
            )}
            {job.priority !== 'normal' && (
              <span className={`badge badge-priority-${job.priority}`}>
                {job.priority.charAt(0).toUpperCase() + job.priority.slice(1)} Priority
              </span>
            )}
          </>
        )}
      </div>

      {/* Assignment & Status */}
      <div className="detail-section">
        <h3>Assignment & Status</h3>
        <div className="detail-controls">
          <div className="detail-control">
            <label>Assigned Electrician</label>
            <select
              value={job.assigned_to || ''}
              onChange={e => handleAssign(e.target.value)}
            >
              <option value="">Unassigned</option>
              {electricians.map(e => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="detail-control">
            <label>Status</label>
            <select
              value={job.status}
              onChange={e => handleStatusChange(e.target.value)}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        {whatsappLink ? (
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn-whatsapp">
            <WhatsAppIcon /> Send to {job.assigned_to} via WhatsApp
          </a>
        ) : job.assigned_to ? (
          <p className="wa-hint">Add a phone number for {job.assigned_to} in Electricians to enable WhatsApp.</p>
        ) : null}
      </div>

      {/* Linked Trips */}
      {linkedTrips.length > 0 && (
        <div className="detail-section">
          <h3>Linked Trips ({linkedTrips.length})</h3>
          <div className="detail-linked-trips">
            {linkedTrips.map(trip => {
              const date = new Date(trip.trip_date || trip.start_time).toLocaleDateString('en-ZA', {
                day: 'numeric', month: 'short',
              });
              const startT = trip.start_time
                ? new Date(trip.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
                : '';
              const endT = trip.end_time
                ? new Date(trip.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <div key={trip.id} className="linked-trip-item">
                  <span className="linked-trip-date">{date}</span>
                  <span className="linked-trip-time">{startT} — {endT}</span>
                  <span className="linked-trip-km">{(trip.distance_km || 0).toFixed(1)} km</span>
                  {trip.user_description && (
                    <span className="linked-trip-desc">{trip.user_description}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Photos */}
      <div className="detail-section">
        <div className="detail-section-header">
          <h3>Photos ({job.photos?.length || 0})</h3>
          <label className="btn-text upload-label">
            {uploading ? 'Uploading...' : '+ Add Photos'}
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handlePhotoUpload}
              disabled={uploading}
            />
          </label>
        </div>
        {job.photos && job.photos.length > 0 ? (
          <div className="detail-photos">
            {job.photos.map(photo => (
              <div key={photo.id} className="detail-photo">
                <img src={`/uploads/${photo.filename}`} alt={photo.original_name} />
                <button
                  className="photo-remove"
                  onClick={() => handleDeletePhoto(photo.id)}
                >&times;</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="detail-no-photos">No photos attached</p>
        )}
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6, verticalAlign: -3 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
