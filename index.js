require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors());
const port = 443;
const HTTPS_PORT = 443;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuração
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const SESSIONS_JSON = path.join(__dirname, 'sessions.json');
const WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL || null;

// Use certificados do Let's Encrypt no servidor remoto
const SSL_KEY_PATH = '/etc/letsencrypt/live/wsapi.freedomai.dev.br/privkey.pem';
const SSL_CERT_PATH = '/etc/letsencrypt/live/wsapi.freedomai.dev.br/fullchain.pem';

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

// Funções para gerenciar sessions.json
function loadSessionsJson() {
    try {
        if (!fs.existsSync(SESSIONS_JSON)) {
            fs.writeFileSync(SESSIONS_JSON, '[]');
            return [];
        }
        return JSON.parse(fs.readFileSync(SESSIONS_JSON, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveSessionsJson(tokens) {
    fs.writeFileSync(SESSIONS_JSON, JSON.stringify(tokens, null, 2));
}

function addTokenToJson(token) {
    const tokens = loadSessionsJson();
    if (!tokens.includes(token)) {
        tokens.push(token);
        saveSessionsJson(tokens);
    }
}

// Gerenciamento de sessões
const sessions = {}; // { [token]: { client, timeout, status, lastQr } }

function getSessionPath(token) {
    return path.join(SESSIONS_DIR, token);
}

function createClient(token) {
    if (sessions[token]) return sessions[token].client;

    addTokenToJson(token); // Registra o token permanentemente

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: getSessionPath(token) }),
        puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });

    sessions[token] = {
        client,
        status: 'INITIALIZING',
        lastQr: null
    };

    // Eventos
    client.on('qr', (qr) => {
        sessions[token].lastQr = qr;
        sessions[token].status = 'QRCODE';
    });

    client.on('ready', () => {
        sessions[token].status = 'CONNECTED';
        sessions[token].lastQr = null;
    });

    client.on('authenticated', () => {
        sessions[token].status = 'AUTHENTICATED';
    });

    client.on('disconnected', () => {
        sessions[token].status = 'DISCONNECTED';
        // Mantém a sessão na memória, apenas marca como desconectada
    });

    client.on('message', async (msg) => {
        // Integração com webhook, se configurado
        if (WEBHOOK_URL) {
            try {
                await axios.post(WEBHOOK_URL, {
                    token,
                    from: msg.from,
                    body: msg.body,
                    timestamp: msg.timestamp,
                    id: msg.id
                });
            } catch (e) {
                console.error('Erro ao enviar webhook:', e.message);
            }
        }
        // Você pode adicionar lógica adicional aqui
    });

    client.initialize();
    return client;
}

// Endpoint: status da sessão
app.get('/status/:token', (req, res) => {
    const { token } = req.params;
    if (!sessions[token]) {
        // Verifica se existe sessão salva no disco
        if (fs.existsSync(getSessionPath(token))) {
            res.json({ status: 'INACTIVE' });
        } else {
            res.json({ status: 'NOT_FOUND' });
        }
    } else {
        res.json({ status: sessions[token].status });
    }
});

// Endpoint: QR code da sessão
app.get('/qrcode/:token', async (req, res) => {
    const { token } = req.params;
    let client = sessions[token]?.client;
    if (!client) client = createClient(token);

    // Aguarda QR code ser gerado ou status final
    let tries = 0;
    function waitForQr(resolve, reject) {
        const status = sessions[token].status;
        if (sessions[token].lastQr) return resolve({ qr: sessions[token].lastQr });
        if (status === 'CONNECTED' || status === 'AUTHENTICATED') return resolve({ connected: true });
        if (status === 'DISCONNECTED' || status === 'INACTIVE') return reject('Sessão desconectada');
        if (++tries > 20) return reject('Timeout ao gerar QR code');
        setTimeout(() => waitForQr(resolve, reject), 500);
    }
    try {
        const result = await new Promise(waitForQr);
        if (result.connected) {
            return res.status(200).json({ message: 'Sessão já conectada ou autenticada.' });
        }
        qrcode.toDataURL(result.qr, (err, url) => {
            if (err) return res.status(500).send('Erro ao gerar QR code.');
            res.json({ qr: url });
        });
    } catch (e) {
        res.status(400).json({ error: typeof e === 'string' ? e : 'Erro ao obter QR code.' });
    }
});

// Endpoint: enviar mensagem
app.post('/send/:token', async (req, res) => {
    const { token } = req.params;
    const { phoneNumber, message } = req.body;
    if (!phoneNumber || !message) {
        return res.status(400).send('Informe phoneNumber e message no body.');
    }
    let client = sessions[token]?.client;
    if (!client) client = createClient(token);

    // Aguarda conexão
    let tries = 0;
    function waitForReady(resolve, reject) {
        if (sessions[token].status === 'CONNECTED') return resolve();
        if (sessions[token].status === 'QRCODE') return reject('Sessão não autenticada. Escaneie o QR code.');
        if (++tries > 20) return reject('Timeout ao conectar sessão');
        setTimeout(() => waitForReady(resolve, reject), 500);
    }
    try {
        await new Promise(waitForReady);
        const chatId = phoneNumber + '@c.us';
        await client.sendMessage(chatId, message);
        res.send('Mensagem enviada com sucesso!');
    } catch (e) {
        res.status(500).send('Erro ao enviar mensagem: ' + e);
    }
});

// Servir arquivos estáticos do diretório 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint para servir index.html na raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Exemplo de endpoint para receber mensagens via webhook já incluso no evento 'message'

// Função para garantir que toda sessão cadastrada no JSON aparece no front, mesmo se não existir a pasta
app.get('/sessions', (req, res) => {
    const tokens = loadSessionsJson();
    const sessionsList = tokens.map(token => {
        const sessionPath = getSessionPath(token);
        let status = 'REMOVED';
        if (sessions[token]) {
            status = sessions[token].status;
        } else if (fs.existsSync(sessionPath)) {
            status = 'INACTIVE';
        }
        return { token, status };
    });
    res.json({ sessions: sessionsList });
});

// Endpoint para criar/cadastrar uma nova sessão manualmente (fixa no JSON)
app.post('/sessions', (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({ error: 'Token inválido.' });
    }
    addTokenToJson(token.trim());
    res.json({ message: 'Sessão cadastrada no sistema.', token: token.trim() });
});

// Inicializar sessões salvas ao iniciar o servidor (garante que todas do JSON são carregadas)
const savedTokens = loadSessionsJson();
savedTokens.forEach(token => {
    // Cria a pasta se não existir (mantém controle total)
    const sessionPath = getSessionPath(token);
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }
    createClient(token);
});

// Segurança extra para a API

// 1. Permitir apenas origens específicas no CORS (ajuste para seu domínio)
app.use(cors({
    origin: [
        'https://wsapi.freedomai.dev.br',
        'http://localhost:3000'
    ]
}));

// 2. Helmet para headers de segurança
const helmet = require('helmet');
app.use(helmet());

// 3. Limitar tamanho do body para evitar ataques de payload grande
app.use(bodyParser.json({ limit: '200kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '200kb' }));

// 4. Rate limit para evitar brute force/DDOS
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(apiLimiter);

// 5. Autenticação por token obrigatória para TODOS os endpoints da API
const API_TOKEN = process.env.API_TOKEN || 'd2e4e6c8-8b2a-4f7b-9c7e-1a2b3c4d5e6f';
function requireApiToken(req, res, next) {
    const token = req.headers['x-api-token'] || req.query.api_token;
    if (token === API_TOKEN) return next();
    return res.status(401).json({ error: 'Token de API obrigatório. Envie no header x-api-token ou ?api_token=...' });
}
// Aplica o middleware globalmente (exceto arquivos estáticos)
app.use((req, res, next) => {
    // Permite acesso livre apenas a arquivos estáticos
    if (req.path.startsWith('/static') || req.path.startsWith('/public') || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.ico')) {
        return next();
    }
    return requireApiToken(req, res, next);
});

// Inicialização do servidor
let server;
if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    const sslOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH)
    };
    // Sobe em ambas as portas: 3460 e 443
    server = https.createServer(sslOptions, app);
    server.listen(port, () => {
        console.log(`Servidor multi-sessão rodando em https://0.0.0.0:${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Erro: porta ${port} já está em uso. Finalize o outro processo ou escolha outra porta.`);
            process.exit(1);
        } else {
            throw err;
        }
    });

    // Porta 443 (padrão HTTPS)
    https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
        console.log(`Servidor multi-sessão rodando em https://0.0.0.0:${HTTPS_PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Erro: porta ${HTTPS_PORT} já está em uso. Finalize o outro processo ou escolha outra porta.`);
        } else {
            throw err;
        }
    });
} else {
    console.error('Certificado SSL não encontrado em /etc/letsencrypt/live/wsapi.freedomai.dev.br/.');
    process.exit(1);
}
    server.listen(port, () => {
        console.log(`Servidor multi-sessão rodando em https://0.0.0.0:${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Erro: porta ${port} já está em uso. Finalize o outro processo ou escolha outra porta.`);
            process.exit(1);
        } else {
            throw err;
        }
    });

    // Porta 443 (padrão HTTPS)
    https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
        console.log(`Servidor multi-sessão rodando em https://0.0.0.0:${HTTPS_PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Erro: porta ${HTTPS_PORT} já está em uso. Finalize o outro processo ou escolha outra porta.`);
        } else {
            throw err;
        }
    });
} else {
    console.error('Certificado SSL não encontrado em /etc/letsencrypt/live/wsapi.freedomai.dev.br/.');
    process.exit(1);
}



