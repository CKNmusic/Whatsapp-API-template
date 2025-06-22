const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const axios = require('axios');

const app = express();
app.use(cors());
const port = 3460;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuração
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutos (ajuste conforme necessário)
const WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL || null; // opcional

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

// Gerenciamento de sessões
const sessions = {}; // { [token]: { client, timeout, status, lastQr } }

function getSessionPath(token) {
    return path.join(SESSIONS_DIR, token);
}

function createClient(token) {
    if (sessions[token]) return sessions[token].client;

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: getSessionPath(token) }),
        puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });

    sessions[token] = {
        client,
        status: 'INITIALIZING',
        lastQr: null,
        timeout: null
    };

    // Eventos
    client.on('qr', (qr) => {
        sessions[token].lastQr = qr;
        sessions[token].status = 'QRCODE';
    });

    client.on('ready', () => {
        sessions[token].status = 'CONNECTED';
        sessions[token].lastQr = null;
        resetInactivityTimeout(token);
    });

    client.on('authenticated', () => {
        sessions[token].status = 'AUTHENTICATED';
        resetInactivityTimeout(token);
    });

    client.on('disconnected', () => {
        sessions[token].status = 'DISCONNECTED';
        clearTimeout(sessions[token].timeout);
        sessions[token].timeout = null;
        // Não remove sessão do disco, só fecha instância
    });

    client.on('message', async (msg) => {
        resetInactivityTimeout(token);
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

function resetInactivityTimeout(token) {
    if (!sessions[token]) return;
    if (sessions[token].timeout) clearTimeout(sessions[token].timeout);
    sessions[token].timeout = setTimeout(() => {
        if (sessions[token]) {
            sessions[token].client.destroy();
            sessions[token].status = 'INACTIVE';
            sessions[token].timeout = null;
            console.log(`Sessão ${token} fechada por inatividade.`);
        }
    }, INACTIVITY_TIMEOUT);
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
        resetInactivityTimeout(token);
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

// Inicialização do servidor
app.listen(port, () => {
    console.log(`Servidor multi-sessão rodando em http://0.0.0.0:${port}`);
});



