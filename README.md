# Document Management System com GitHub Copilot

<img src="https://octodex.github.com/images/Professortocat_v2.png" align="right" height="200px" />

Hey josajunior81!

Mona here. I'm done preparing your exercise. Hope you enjoy! 💚

Remember, it's self-paced so feel free to take a break! ☕️

[![](https://img.shields.io/badge/Go%20to%20Exercise-%E2%86%92-1f883d?style=for-the-badge&logo=github&labelColor=197935)](https://github.com/treinamentos-serpro/document-management-system-josafa.souza/issues/1)

---

## Backend do DMS

O backend implementa upload, listagem e download com a separação
`routes -> controllers -> services -> repositories`. Os contratos completos
estão em [docs/specs/dms-spec.md](docs/specs/dms-spec.md).

```sh
cd backend
npm ci
npm start
```

Configuração por variáveis de ambiente:

| Variável | Padrão | Descrição |
| -------- | ------ | --------- |
| `PORT` | `3000` | Porta HTTP (inteiro entre 0 e 65535; 0 permite uma porta disponível). |
| `MAX_FILE_SIZE_MB` | `10` | Limite de cada arquivo em MiB, inteiro positivo. Exatamente o limite é aceito. |

Os arquivos são gravados em `backend/storage`, independentemente do diretório
de onde o processo é iniciado, usando `multer.diskStorage` e nomes internos
gerados pelo servidor. Os metadados ficam somente em memória. Reiniciar o
processo perde os registros, mas não apaga os arquivos existentes.

Todas as rotas de documentos exigem `X-User-Id`. Esse cabeçalho não autentica o
usuário: o filtro por proprietário é apenas uma convenção do MVP.

```sh
# Um arquivo por requisição, no campo file.
curl -H 'X-User-Id: alice' -F 'file=@/caminho/relatorio.pdf' \
  http://localhost:3000/upload

curl -H 'X-User-Id: alice' http://localhost:3000/documents

# Substitua DOCUMENT_ID pelo id retornado pelo upload.
curl -H 'X-User-Id: alice' -OJ \
  http://localhost:3000/documents/DOCUMENT_ID/download
```

O upload retorna `201` com `{ "document": { ... } }`; a listagem retorna `200`
com `{ "documents": [ ... ] }`; o download retorna conteúdo binário como anexo.
Erros retornam `{ "error": { "code": "...", "message": "..." } }`.
Além dos erros dos contratos, o parser JSON retorna `400 INVALID_REQUEST` para
JSON malformado e `413 REQUEST_TOO_LARGE` para corpos JSON acima do limite do
Express. Falhas inesperadas são registradas no servidor sem expor detalhes ao
cliente.

Para executar os testes nativos de Node, a partir da raiz do repositório:

```sh
npm test --prefix backend
```

Os testes usam subdiretórios temporários em `backend/storage` e removem somente
os próprios arquivos ao final. O endpoint `GET /health` continua disponível.
O frontend pode chamar as rotas com `/api` pelo proxy do Vite; não foi
implementado nesta etapa.

---

&copy; 2025 GitHub &bull; [Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md) &bull; [MIT License](https://gh.io/mit)
