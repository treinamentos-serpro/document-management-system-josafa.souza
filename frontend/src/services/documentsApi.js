async function request(path, owner, options = {}) {
  const userId = owner.trim();
  if (!userId) {
    throw new Error('Informe o identificador do usuário.');
  }

  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'X-User-Id': userId },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar ao servidor. Tente novamente.', { cause: error });
  }

  if (!response.ok) {
    let body;
    try {
      body = await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`O servidor retornou um erro (${response.status}) sem detalhes válidos.`, { cause: error });
    }
    throw new Error(body?.error?.message || `A requisição falhou (${response.status}).`);
  }
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('O servidor retornou uma resposta inválida.', { cause: error });
  }
}

function isDocument(document) {
  return document !== null && typeof document === 'object'
    && typeof document.id === 'string'
    && typeof document.originalName === 'string'
    && Number.isSafeInteger(document.size) && document.size >= 0
    && typeof document.uploadedAt === 'string'
    && !Number.isNaN(Date.parse(document.uploadedAt))
    && typeof document.owner === 'string';
}

export async function listDocuments(owner, { signal } = {}) {
  const response = await request('/documents', owner, { signal });
  const body = await readJson(response);
  if (!Array.isArray(body?.documents) || !body.documents.every(isDocument)) {
    throw new Error('O servidor retornou uma lista de documentos inválida.');
  }
  return body.documents;
}

export async function uploadDocument(file, owner, { signal } = {}) {
  if (!file) throw new Error('Selecione um arquivo para enviar.');
  const body = new FormData();
  body.append('file', file);
  const response = await request('/upload', owner, { method: 'POST', body, signal });
  const result = await readJson(response);
  if (!isDocument(result?.document)) {
    throw new Error('O servidor retornou os dados do documento inválidos.');
  }
  return result.document;
}

export async function downloadDocument(id, owner, { signal } = {}) {
  const response = await request(`/documents/${encodeURIComponent(id)}/download`, owner, { signal });
  try {
    return await response.blob();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Não foi possível concluir a transferência do arquivo.', { cause: error });
  }
}
