import { useEffect, useRef, useState } from 'react';
import { uploadDocument } from '../services/documentsApi.js';

export default function UploadComponent({ owner, onUploaded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const document = await uploadDocument(file, owner, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setFile(null);
      inputRef.current.value = '';
      setMessage(`Documento "${document.originalName}" enviado com sucesso.`);
      onUploaded();
    } catch (uploadError) {
      if (!controller.signal.aborted) setError(uploadError.message);
    } finally {
      if (!controller.signal.aborted) {
        requestRef.current = null;
        setUploading(false);
      }
    }
  }

  return (
    <section aria-labelledby="upload-title">
      <h2 id="upload-title">Enviar documento</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="document-file">Arquivo</label>
        <input
          ref={inputRef}
          id="document-file"
          type="file"
          required
          disabled={uploading}
          onChange={(event) => {
            setFile(event.target.files[0] || null);
            setError('');
            setMessage('');
          }}
        />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? 'Enviando...' : 'Enviar documento'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
