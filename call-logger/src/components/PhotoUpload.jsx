import React, { useState, useRef } from 'react';

export default function PhotoUpload({ files, onChange }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (newFiles) => {
    const imageFiles = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
    const total = files.length + imageFiles.length;
    if (total > 5) {
      alert('Maximum 5 photos allowed');
      return;
    }
    onChange([...files, ...imageFiles]);
  };

  const removeFile = (index) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="photo-upload">
      <div
        className={`photo-dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
        />
        <span className="photo-dropzone-text">
          Drop photos here or click to browse
        </span>
        <span className="photo-dropzone-hint">{files.length}/5 photos</span>
      </div>

      {files.length > 0 && (
        <div className="photo-previews">
          {files.map((file, i) => (
            <div key={i} className="photo-preview">
              <img src={URL.createObjectURL(file)} alt={file.name} />
              <button type="button" className="photo-remove" onClick={() => removeFile(i)}>
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
