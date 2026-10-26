import { useEffect, useRef, useState } from 'react';
import { downloadDocument } from '../services/documentsApi.js';

export default function DownloadButton({ document, owner }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function handleDownload() {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setDownloading(true);
    setError('');
    try {
      const blob = await downloadDocument(document.id, owner, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      try {
        link.href = url;
        link.download = document.originalName;
        window.document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        // A revogação é adiada para permitir que o navegador inicie o download.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (downloadError) {
      if (!controller.signal.aborted) setError(downloadError.message);
    } finally {
      if (!controller.signal.aborted) {
        requestRef.current = null;
        setDownloading(false);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Baixar ${document.originalName}`}
      >
        {downloading ? 'Baixando...' : 'Baixar'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
