import { useState } from 'react';
import UploadComponent from './components/UploadComponent.jsx';
import DocumentList from './components/DocumentList.jsx';
import './App.css';

function DocumentWorkspace({ owner }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <p>Usuário atual: <strong>{owner}</strong></p>
      <UploadComponent owner={owner} onUploaded={() => setRefreshKey((value) => value + 1)} />
      <DocumentList owner={owner} refreshKey={refreshKey} />
    </>
  );
}

export default function App() {
  const [userInput, setUserInput] = useState('');
  const [owner, setOwner] = useState('');
  const [error, setError] = useState('');

  function handleUserSubmit(event) {
    event.preventDefault();
    const userId = userInput.trim();
    if (!userId) {
      setError('Informe o identificador do usuário.');
      return;
    }
    setError('');
    setOwner(userId);
  }

  return (
    <main>
      <h1>Document Management System</h1>
      <p>Envie, consulte e baixe seus documentos.</p>
      <form onSubmit={handleUserSubmit}>
        <label htmlFor="user-id">Identificador do usuário</label>
        <input
          id="user-id"
          value={userInput}
          onChange={(event) => setUserInput(event.target.value)}
          required
          aria-describedby="user-notice"
        />
        <button type="submit">Usar identificador</button>
      </form>
      <p id="user-notice">
        Este MVP não possui autenticação. O identificador informado não comprova sua identidade.
      </p>
      {error && <p role="alert">{error}</p>}
      {owner
        ? <DocumentWorkspace key={owner} owner={owner} />
        : <p>Informe seu identificador para acessar os documentos.</p>}
    </main>
  );
}
