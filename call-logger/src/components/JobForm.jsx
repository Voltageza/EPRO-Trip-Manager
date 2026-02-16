import React, { useState, useEffect, useRef } from 'react';
import CustomerSearch from './CustomerSearch.jsx';
import PhotoUpload from './PhotoUpload.jsx';
import { createJob, uploadPhotos, fetchElectricians } from '../api/api.js';

export default function JobForm({ onCreated, onCancel }) {
  const [customer, setCustomer] = useState(null);
  const [assignedTo, setAssignedTo] = useState('');
  const [description, setDescription] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [priority, setPriority] = useState('normal');
  const [photos, setPhotos] = useState([]);
  const [electricians, setElectricians] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    fetchElectricians()
      .then(setElectricians)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!description.trim()) {
      setError('Please enter a job description');
      return;
    }
    submittingRef.current = true;
    setError('');
    setSubmitting(true);

    try {
      const job = await createJob({
        customer_id: customer?.id || null,
        assigned_to: assignedTo || null,
        description: description.trim(),
        special_instructions: specialInstructions.trim() || null,
        priority,
      });

      if (photos.length > 0) {
        await uploadPhotos(job.id, photos);
      }

      onCreated(job);
    } catch (err) {
      setError(err.message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="job-form-container">
      <div className="job-form-header">
        <h2>Log New Service Call</h2>
        {onCancel && (
          <button type="button" className="btn-text" onClick={onCancel}>Cancel</button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="job-form">
        <div className="form-section">
          <label className="form-label">Customer</label>
          <CustomerSearch value={customer} onChange={setCustomer} />
        </div>

        <div className="form-section">
          <label className="form-label" htmlFor="description">Description *</label>
          <textarea
            id="description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the problem or service needed..."
            rows={3}
            required
          />
        </div>

        <div className="form-section">
          <label className="form-label" htmlFor="specialInstructions">Special Instructions</label>
          <textarea
            id="specialInstructions"
            value={specialInstructions}
            onChange={e => setSpecialInstructions(e.target.value)}
            placeholder="Gate code, contact person, access notes..."
            rows={2}
          />
        </div>

        <div className="form-row">
          <div className="form-section form-section-half">
            <label className="form-label" htmlFor="assignedTo">Assign Electrician</label>
            <select
              id="assignedTo"
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
            >
              <option value="">Unassigned</option>
              {electricians.map(e => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-section form-section-half">
            <label className="form-label" htmlFor="priority">Priority</label>
            <select
              id="priority"
              value={priority}
              onChange={e => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="form-section">
          <label className="form-label">Photos</label>
          <PhotoUpload files={photos} onChange={setPhotos} />
        </div>

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="btn-primary btn-lg" disabled={submitting}>
          {submitting ? 'Creating Job...' : 'Log Service Call'}
        </button>
      </form>
    </div>
  );
}
