const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');


const app = express();
app.use(cors());
const port = 3460;
let isLogged = false;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Inicializar o client do WhatsApp-Web.js
global.client = client;
client.initialize();

// Gerar o QRCode para autenticação
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR code gerado. Escaneie com o WhatsApp.');
});

client.on('authenticated', () => {
    console.log('WhatsApp autenticado!');
    isLogged = true;
});

client.on('disconnected', () => {
    console.log('WhatsApp desconectado!');
    isLogged = false;
});

// Escuta mensagens recebidas apenas de grupos, envia para API e exibe no terminal
client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (chat.isGroup) {
        const sender = msg.author || msg.from;
        const groupName = chat.name;
        const messageText = msg.body;
        console.log(`[${groupName}] ${sender}: ${messageText}`);

        // Monta o payload para a API
        const payload = {
            inputs: {},
            query: messageText,
            response_mode: 'blocking',
            conversation_id: '',
            user: sender,
            files: []
        };

        try {
            const response = await axios.post(
                'http://189.90.52.228/v1/chat-messages',
                payload,
                {
                    headers: {
                        'Authorization': 'Bearer app-kHgpjqlF2kCbmY1wdDmsGZkW',
                        'Content-Type': 'application/json'
                    }
                }
            );
            if (response.data && response.data.answer) {
                console.log(`[API Response] ${response.data.answer}`);
                // Envia a resposta para o grupo, marcando a mensagem original
                await msg.reply(response.data.answer);
            } else {
                console.log('[API Response] Sem resposta de texto.');
            }
        } catch (err) {
            console.error('[API Error]', err.response ? err.response.data : err.message);
        }
    }
});

// Endpoint para checar se está logado
app.get('/isLog', (req, res) => {
    res.send(isLogged ? 'yes' : 'no');
});

// Endpoint para enviar mensagem
app.post('/send', async (req, res) => {
    const { phoneNumber, message } = req.body;
    if (!isLogged) {
        return res.status(500).send('O cliente do WhatsApp não está pronto. Aguarde a inicialização.');
    }
    if (!phoneNumber || !message) {
        return res.status(400).send('Informe phoneNumber e message no body.');
    }
    try {
        const chatId = phoneNumber + '@c.us';
        await client.sendMessage(chatId, message);
        res.send('Mensagem enviada com sucesso!');
    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao enviar a mensagem.');
    }
});

app.listen(port, () => {
    console.log(`Servidor está rodando em http://0.0.0.0:${port}`);
});



