const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');


const app = express();
app.use(cors());
const port = 3460;
let isLogged = false;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const client = new Client();

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



