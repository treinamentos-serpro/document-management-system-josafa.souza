# Especificação - Document Management System

> Especificação do MVP para orientar o desenvolvimento guiado por especificação.
> Esta tarefa entrega somente este documento; as etapas de implementação abaixo
> são futuras e não fazem parte da entrega atual.

## 1. Objetivo

Permitir que usuários enviem, listem e baixem seus documentos por meio de uma
interface web, mantendo os arquivos no filesystem local da aplicação e os
metadados em memória.

## 2. Escopo

### Dentro do escopo

- Envio de um documento por requisição.
- Listagem dos documentos associados ao identificador do usuário informado pelo
  cliente.
- Download de um documento pertencente ao usuário informado.
- Interface React para informar o identificador do usuário, enviar documentos,
  visualizar a lista e baixar documentos.
- Armazenamento dos arquivos em `backend/storage`, usando `multer` com
  `diskStorage`.
- Metadados armazenados em memória durante a execução do processo.
- Limite de upload configurável por variável de ambiente, com padrão de 10 MiB.

### Fora do escopo

- Autenticação, cadastro de contas, sessões ou autorização baseada em identidade
  verificada.
- Armazenamento externo, em nuvem ou em banco de dados.
- Persistência de metadados após reinício do processo.
- Versionamento, edição, exclusão, busca ou compartilhamento de documentos.
- Paginação, categorias, pastas ou pré-visualização de arquivos.
- Restrição por extensão ou tipo MIME; o MVP aceita qualquer tipo de arquivo,
  respeitado o limite de tamanho.

### Limitações conhecidas

- O identificador de usuário recebido do cliente não comprova a identidade de
  quem faz a requisição. A separação por usuário é uma convenção funcional do
  MVP, não um mecanismo de autenticação adequado para proteger dados em
  produção.
- Os arquivos gravados em disco sobrevivem ao reinício, mas os metadados em
  memória não. Após um reinício, arquivos existentes podem ficar sem registro e
  não poderão ser listados ou baixados pela aplicação. O MVP não faz limpeza ou
  reconstrução automática desses arquivos.

## 3. Requisitos funcionais

| ID     | Requisito |
| ------ | --------- |
| RF-01  | O cliente deve informar um identificador de usuário não vazio no cabeçalho `X-User-Id` em todas as operações de documentos. |
| RF-02  | O usuário pode enviar um arquivo por vez usando `multipart/form-data`, no campo `file`. |
| RF-03  | O serviço deve recusar requisições sem arquivo, sem identificador de usuário ou com arquivo maior que o limite configurado. |
| RF-04  | Após um upload bem-sucedido, o serviço deve gerar um identificador único, registrar os metadados em memória e retornar os metadados do documento. |
| RF-05  | O usuário pode listar somente os documentos cujo campo `owner` corresponde ao identificador informado em `X-User-Id`. |
| RF-06  | Uma listagem sem documentos deve retornar sucesso e uma lista vazia. |
| RF-07  | O usuário pode baixar um documento pelo identificador somente quando o documento pertence ao identificador informado em `X-User-Id`. |
| RF-08  | Para documento inexistente ou pertencente a outro usuário, o serviço deve retornar o mesmo erro de não encontrado, sem revelar sua existência a terceiros. |
| RF-09  | A interface deve permitir informar o identificador de usuário e selecionar/enviar um arquivo, apresentando estados de envio e erros comunicáveis ao usuário. |
| RF-10  | A interface deve exibir a lista do usuário atual, um estado vazio quando não houver documentos e uma ação de download para cada documento. |
| RF-11  | A interface deve chamar a API com o prefixo `/api`; no desenvolvimento, o proxy do Vite remove esse prefixo antes de encaminhar ao backend. |

## 4. Requisitos não funcionais

| ID      | Requisito |
| ------- | --------- |
| RNF-01  | Os arquivos devem ser gravados exclusivamente no filesystem local, no diretório `backend/storage`, usando `multer` configurado com `diskStorage`. Não usar serviços ou provedores externos de armazenamento. |
| RNF-02  | Os metadados devem permanecer em memória nesta fase; não adicionar banco de dados nem mecanismo externo de persistência. |
| RNF-03  | O limite de tamanho deve ser configurável por `MAX_FILE_SIZE_MB`, expresso em MiB (1 MiB = 1.048.576 bytes), com padrão de 10 MiB. |
| RNF-04  | A configuração de porta deve usar a variável `PORT`, com padrão de `3000`. |
| RNF-05  | Valores inválidos para configurações numéricas obrigatórias, como limite de upload, devem ser reportados explicitamente na inicialização; não devem resultar em limite silenciosamente desabilitado. |
| RNF-06  | O nome original do arquivo deve ser preservado nos metadados e no nome sugerido para download. O nome usado no filesystem deve ser gerado pela aplicação, sem confiar no nome fornecido pelo cliente. |
| RNF-07  | Caminhos locais e nomes internos de armazenamento não devem ser incluídos nas respostas da API. |
| RNF-08  | Erros da API devem ter formato JSON consistente e não devem expor stack traces, caminhos locais ou detalhes internos ao cliente. |
| RNF-09  | O backend deve seguir a separação `routes -> controllers -> services -> repositories`; camadas internas não devem depender de Express ou de detalhes do frontend. |
| RNF-10  | O frontend deve usar componentes funcionais React com Hooks e consumir o backend com `fetch` através do proxy `/api` configurado no Vite. |
| RNF-11  | A interface e os erros apresentados ao usuário devem estar em português; símbolos de código devem usar nomes em inglês. |
| RNF-12  | O sistema deve validar entrada nos limites HTTP e tratar explicitamente erros de gravação, leitura e streaming de arquivos. |

## 5. Modelo de dados

### Metadados do documento

Os metadados são mantidos em uma coleção em memória durante a vida do processo.
Os campos abaixo são internos; a API retorna apenas os campos públicos indicados.

| Campo         | Tipo   | Público | Descrição |
| ------------- | ------ | ------- | --------- |
| `id`          | string | Sim     | Identificador único do documento, gerado pelo servidor (UUID). |
| `originalName`| string | Sim     | Nome original informado para o arquivo. Usado como nome sugerido no download, nunca como caminho local. |
| `size`        | number | Sim     | Tamanho do conteúdo em bytes, como inteiro não negativo. |
| `uploadedAt`  | string | Sim     | Data e hora de recebimento do upload em ISO 8601, UTC. |
| `owner`       | string | Sim     | Identificador não vazio recebido no cabeçalho `X-User-Id`. |
| `storageName` | string | Não     | Nome opaco gerado pelo servidor e usado para localizar o arquivo dentro de `backend/storage`. Não contém caminho absoluto e não é exposto pela API. |

### Regras e invariantes

- `id` deve ser único entre os documentos registrados no processo.
- `owner` é uma string normalizada removendo espaços no início e no fim; valor
  vazio é inválido. O MVP não valida se esse identificador corresponde a uma
  conta real.
- `size` representa os bytes efetivamente gravados e não um valor fornecido pelo
  cliente.
- `storageName` é criado pelo servidor e não deve ser derivado diretamente de
  `originalName`; o caminho final deve permanecer dentro de `backend/storage`.
- `originalName`, `size`, `uploadedAt`, `owner` e `id` formam a representação
  pública `DocumentMetadata`. `storageName` é detalhe interno do repositório.
- Se o registro dos metadados falhar depois de gravar o arquivo, o serviço deve
  tentar remover o arquivo recém-gravado e reportar a falha. Erros de limpeza
  também devem ser registrados explicitamente.

## 6. Contratos de API

### Convenções

- Rotas do backend: `/upload`, `/documents` e
  `/documents/:id/download`.
- Chamadas feitas pelo frontend no desenvolvimento usam `/api/upload`,
  `/api/documents` e `/api/documents/:id/download`. O proxy do Vite encaminha
  essas chamadas ao backend removendo o prefixo `/api`.
- Todas as rotas de documentos exigem `X-User-Id`. Ausência ou valor vazio
  resulta em `400 Bad Request`.
- Respostas de sucesso JSON usam envelopes descritos abaixo. Respostas de erro
  JSON usam o formato:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Descrição segura do erro."
  }
}
```

- O frontend deve usar `fetch`, enviar o cabeçalho de usuário em cada chamada e
  apresentar mensagens adequadas para respostas não-2xx.

### POST `/upload`

Envia um documento para o usuário informado.

**Cabeçalhos**

| Nome | Obrigatório | Descrição |
| ---- | ----------- | --------- |
| `X-User-Id` | Sim | Identificador do proprietário neste MVP. |
| `Content-Type` | Sim | `multipart/form-data`, gerado pelo cliente com o boundary apropriado. |

**Corpo**

Uma parte de arquivo chamada `file`. Deve haver exatamente um arquivo. Qualquer
tipo/extensão é aceito; arquivos acima do limite configurado são recusados.

**Sucesso — `201 Created`**

```json
{
  "document": {
    "id": "uuid",
    "originalName": "relatorio.pdf",
    "size": 24576,
    "uploadedAt": "2026-10-26T19:08:38.526Z",
    "owner": "usuario-123"
  }
}
```

**Erros**

| Status | Código | Quando |
| ------ | ------ | ------ |
| `400` | `USER_ID_REQUIRED` | Cabeçalho de usuário ausente ou vazio. |
| `400` | `FILE_REQUIRED` | Arquivo `file` ausente. |
| `400` | `INVALID_UPLOAD` | Requisição multipart inválida ou quantidade de arquivos diferente de um. |
| `413` | `FILE_TOO_LARGE` | Arquivo excede `MAX_FILE_SIZE_MB`. |
| `500` | `UPLOAD_FAILED` | Falha inesperada ao gravar o arquivo ou registrar os metadados. |

### GET `/documents`

Lista os documentos do usuário informado. Não recebe parâmetros de paginação no
MVP.

**Cabeçalhos**

| Nome | Obrigatório | Descrição |
| ---- | ----------- | --------- |
| `X-User-Id` | Sim | Identificador do proprietário usado para filtrar os resultados. |

**Sucesso — `200 OK`**

```json
{
  "documents": [
    {
      "id": "uuid",
      "originalName": "relatorio.pdf",
      "size": 24576,
      "uploadedAt": "2026-10-26T19:08:38.526Z",
      "owner": "usuario-123"
    }
  ]
}
```

`documents` é uma lista vazia quando o usuário ainda não enviou arquivos.
Resultados devem ser apresentados do mais recente para o mais antigo.

**Erros**

| Status | Código | Quando |
| ------ | ------ | ------ |
| `400` | `USER_ID_REQUIRED` | Cabeçalho de usuário ausente ou vazio. |
| `500` | `DOCUMENT_LIST_FAILED` | Falha inesperada ao consultar os metadados em memória. |

### GET `/documents/:id/download`

Transfere o conteúdo binário de um documento pertencente ao usuário informado.

**Cabeçalhos**

| Nome | Obrigatório | Descrição |
| ---- | ----------- | --------- |
| `X-User-Id` | Sim | Identificador do usuário proprietário. |

**Sucesso — `200 OK`**

- Corpo: conteúdo binário do arquivo.
- `Content-Type`: `application/octet-stream`.
- `Content-Disposition`: `attachment`, com o nome original como nome de
  download, codificado de forma segura pelo servidor.
- A resposta não deve revelar `storageName` nem o caminho local.

**Erros**

| Status | Código | Quando |
| ------ | ------ | ------ |
| `400` | `USER_ID_REQUIRED` | Cabeçalho de usuário ausente ou vazio. |
| `400` | `INVALID_DOCUMENT_ID` | Identificador malformado. |
| `404` | `DOCUMENT_NOT_FOUND` | Documento não existe ou não pertence ao usuário informado. |
| `500` | `DOWNLOAD_FAILED` | Falha de leitura/stream do arquivo antes do início da resposta. |

Se ocorrer erro depois de iniciado o streaming, o servidor deve registrar a
falha e encerrar a transferência; não deve tentar enviar uma resposta JSON
substituta depois dos cabeçalhos da resposta.

## 7. Decisões arquiteturais

- **Backend:** Node.js + Express em CommonJS.
- **Rotas (`routes/`):** declaram os caminhos HTTP e delegam a execução aos
  controllers.
- **Controllers (`controllers/`):** validam os dados HTTP de entrada, chamam os
  services e traduzem resultados/erros para status e respostas HTTP.
- **Services (`services/`):** coordenam regras de negócio, validação do limite,
  autorização funcional por `owner` e operações de upload/listagem/download.
- **Repositories (`repositories/`):** encapsulam a gravação/leitura de arquivos
  locais e a coleção de metadados em memória.
- **Armazenamento:** `multer` com `diskStorage`, diretório local
  `backend/storage`, nomes internos gerados pelo servidor; nenhum storage
  externo. O diretório deve existir ou ser criado localmente pela aplicação.
- **Metadados:** coleção em memória, sem banco nesta fase. Reinícios eliminam os
  registros, mas não os arquivos. Não fazer varredura, reconstrução ou limpeza
  automática no início.
- **Identidade:** `X-User-Id` é informado pelo cliente e usado como proprietário
  e filtro. Não há autenticação nem garantia de identidade; introduzir
  autenticação exigirá uma especificação futura.
- **Frontend:** React + Vite em ESM, componentes funcionais e Hooks. Componentes
  previstos: `UploadComponent`, `DocumentList` e `DownloadButton`; a comunicação
  fica em `services/` e usa `fetch` pelo prefixo `/api`.
- **Configuração:** `PORT` (padrão `3000`) e `MAX_FILE_SIZE_MB` (padrão `10`).
  O frontend usa o proxy local do Vite configurado para encaminhar `/api` ao
  backend durante o desenvolvimento.

## 8. Plano de execução

As etapas abaixo descrevem trabalho futuro de implementação e não fazem parte
desta entrega documental.

1. **Preparar configuração e persistência local:** validar as variáveis de
   ambiente, garantir o diretório `backend/storage` e definir o repositório de
   arquivos em disco e metadados em memória.
2. **Implementar upload:** configurar `multer` com `diskStorage` e limite de
   tamanho; implementar rota, controller, service e repository; validar usuário
   e arquivo; registrar metadados e tratar falhas/limpeza.
3. **Implementar listagem e download:** filtrar por `owner`, retornar metadados
   públicos e transmitir arquivos somente ao proprietário informado, sem
   expor caminhos locais.
4. **Construir a interface:** criar os componentes de upload, listagem e
   download; obter o identificador do usuário da interface; integrar com a API
   usando `fetch` e o proxy `/api`; apresentar carregamento, estado vazio e
   erros.
5. **Validar o MVP integrado:** cobrir limites e erros das rotas, isolamento
   funcional entre identificadores, conteúdo baixado, exibição na interface e
   comportamento conhecido após reinício. Executar testes do backend e build do
   frontend.
