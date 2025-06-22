# Autenticação por Token na API (x-api-token)

Sua API está protegida por um token de autenticação para endpoints sensíveis, como envio de mensagens.

## Como usar o token

O token padrão é:
```
d2e4e6c8-8b2a-4f7b-9c7e-1a2b3c4d5e6f
```
(Altere para um valor seguro em produção!)

Você deve enviar esse token em **todas as requisições POST/GET protegidas** (exemplo: `/send/:token`).

### Enviando o token no header

No seu request, adicione o header:

```
x-api-token: d2e4e6c8-8b2a-4f7b-9c7e-1a2b3c4d5e6f
```

**Exemplo usando fetch (JavaScript):**
```js
fetch('/send/SEU_TOKEN', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-token': 'd2e4e6c8-8b2a-4f7b-9c7e-1a2b3c4d5e6f'
  },
  body: JSON.stringify({ phoneNumber: '5511999999999', message: 'Olá!' })
})
```

### Enviando o token via query string

Você também pode passar o token na URL:

```
POST /send/SEU_TOKEN?api_token=d2e4e6c8-8b2a-4f7b-9c7e-1a2b3c4d5e6f
```

**Exemplo usando curl:**
```sh
curl -X POST "https://wsapi.freedomai.dev.br/send/SEU_TOKEN?api_token=d2e4e6c8-8b2a-4f7b-9c7e-1a2b3c4d5e6f" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"5511999999999","message":"Olá!"}'
```

## O que acontece se não enviar o token?

A API retorna:
```json
{ "error": "Token de API inválido." }
```
com status HTTP 401.

---

**Dica:**  
Para máxima segurança, altere o valor do token e use variáveis de ambiente (`API_TOKEN`) no servidor.
