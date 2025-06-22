# WhatsApp Multi-Sessão API

API REST para gerenciamento de múltiplas sessões do WhatsApp via [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

Cada sessão é identificada por um `token` único, definido pelo usuário.

---

## Endpoints

### 0. Listar sessões existentes

**GET** `/sessions`

- **Descrição:** Retorna a lista de tokens das sessões salvas no servidor.
- **Respostas:**
  - `200 OK` — Exemplo: `{ "sessions": ["empresa123", "meu-token", ...] }`

**Exemplo:**
```bash
curl http://localhost:3460/sessions
```

---

### 1. Verificar status da sessão

**GET** `/status/:token`

- **Descrição:** Retorna o status da sessão associada ao token.
- **Respostas:**
  - `{ "status": "CONNECTED" }` — Sessão conectada.
  - `{ "status": "QRCODE" }` — Sessão aguardando autenticação via QR code.
  - `{ "status": "INACTIVE" }` — Sessão existe, mas está inativa.
  - `{ "status": "NOT_FOUND" }` — Sessão não existe.

**Exemplo:**
```bash
curl http://localhost:3460/status/meu-token
```

---

### 2. Obter QR code para autenticação

**GET** `/qrcode/:token`

- **Descrição:** Retorna o QR code (base64) para autenticação da sessão.
- **Respostas:**
  - `{ "qr": "data:image/png;base64,..." }` — QR code para autenticação.
  - `{ "message": "Sessão já conectada ou autenticada." }` — Sessão já autenticada.
  - `{ "error": "..." }` — Erro ao gerar QR code.

**Exemplo:**
```bash
curl http://localhost:3460/qrcode/meu-token
```

---

### 3. Enviar mensagem

**POST** `/send/:token`

- **Descrição:** Envia uma mensagem usando a sessão do token.
- **Body:** (JSON)
  - `phoneNumber`: Número do destinatário (ex: 5511999999999)
  - `message`: Texto da mensagem

- **Respostas:**
  - `200 OK` — Mensagem enviada com sucesso.
  - `400/500` — Erro ao enviar mensagem.

**Exemplo:**
```bash
curl -X POST http://localhost:3460/send/meu-token \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"5511999999999","message":"Olá!"}'
```

---

## Webhook para mensagens recebidas

Se a variável de ambiente `WHATSAPP_WEBHOOK_URL` estiver definida, toda mensagem recebida será enviada via POST para o webhook:

- **Formato do payload:**
```json
{
  "token": "meu-token",
  "from": "5511999999999@c.us",
  "body": "Mensagem recebida",
  "timestamp": 1710000000,
  "id": { /* objeto id da mensagem */ }
}
```

---

## Gerenciamento de Sessões

- Cada token representa uma sessão independente.
- As sessões são salvas em disco (`/sessions/:token`).
- Instâncias são abertas sob demanda e fechadas após 5 minutos de inatividade (configurável).
- Não é necessário escanear o QR code novamente após reiniciar o servidor, exceto se a sessão expirar/desconectar.

---

## Exemplos de Fluxo

1. **Criar sessão:**  
   - Escolha um token (ex: `empresa123`).
   - Acesse `/qrcode/empresa123` e escaneie o QR code.
   - Após autenticar, envie mensagens via `/send/empresa123`.

2. **Verificar status:**  
   - Consulte `/status/empresa123` para saber se está conectado.

---

## Observações

- O número deve ser informado com DDI e DDD, sem espaços ou caracteres especiais.
- O sistema suporta múltiplas sessões simultâneas.
- Para escalar horizontalmente, utilize um armazenamento compartilhado para a pasta `sessions` (ex: NFS, S3, etc).
- **Dependências do Chromium:**  
  Se ao rodar a API aparecer erro de dependências do Chrome/Puppeteer, instale os pacotes recomendados para sua distribuição.  
  Em alguns sistemas, alguns pacotes podem não estar disponíveis.  
  Nesse caso, instale apenas os pacotes que existem, ignorando os que não forem encontrados.  
  Consulte sempre a [documentação oficial do Puppeteer](https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#chrome-headless-doesnt-launch-on-unix) para a lista mais atualizada de dependências.
- **Erros comuns e soluções rápidas:**  
  - Se aparecer erro como  
    `error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory`  
    instale o pacote:
    ```bash
    sudo apt-get update
    sudo apt-get install -y libatk1.0-0
    ```
  - Se aparecer erro como  
    `error while loading shared libraries: libatk-bridge-2.0.so.0: cannot open shared object file: No such file or directory`  
    instale o pacote:
    ```bash
    sudo apt-get install -y libatk-bridge2.0-0
    ```
  - Repita para outros pacotes que forem solicitados no erro, conforme necessário.

---
