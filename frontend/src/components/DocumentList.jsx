import { useEffect, useState } from 'react';
import { listDocuments } from '../services/documentsApi.js';
import DownloadButton from './DownloadButton.jsx';

export default function DocumentList({ owner, refreshKey }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function loadDocuments() {
      try {
        const result = await listDocuments(owner, { signal: controller.signal });
        if (!controller.signal.aborted) setDocuments(result);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadDocuments();
    return () => controller.abort();
  }, [owner, refreshKey, retry]);

  return (
    <section aria-labelledby="documents-title" aria-busy={loading}>
      <h2 id="documents-title">Meus documentos</h2>
      <button type="button" disabled={loading} onClick={() => setRetry((value) => value + 1)}>
        Atualizar lista
      </button>
      {loading ? <p role="status">Carregando documentos...</p>
        : error ? <p role="alert">{error}</p>
          : documents.length === 0 ? <p>Nenhum documento enviado.</p>
            : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th scope="col">Nome</th><th scope="col">Tamanho</th><th scope="col">Enviado em</th><th scope="col">Ação</th></tr>
                  </thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td>{document.originalName}</td>
                        <td>{document.size.toLocaleString('pt-BR')} bytes</td>
                        <td>{new Date(document.uploadedAt).toLocaleString('pt-BR')}</td>
                        <td><DownloadButton document={document} owner={owner} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </section>
  );
}
