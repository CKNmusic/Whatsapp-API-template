const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

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

let groupMessageCounters = {};

// Escuta mensagens recebidas apenas de grupos, envia para API e exibe no terminal
client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (chat.isGroup) {
        const sender = msg.author || msg.from;
        const groupName = chat.name;
        const messageText = msg.body;
        console.log(`[${groupName}] ${sender}: ${messageText}`);

        // Inicializa o contador para o grupo se não existir
        if (!groupMessageCounters[chat.id._serialized]) {
            groupMessageCounters[chat.id._serialized] = 0;
        }

        // Se for áudio
        if (msg.hasMedia) {
            console.log('DEBUG: msg.type =', msg.type, 'msg.mimetype =', msg.mimetype);
        }
        // Aceita também msg.type === 'ptt' (áudio de voz do WhatsApp)
        if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
            const media = await msg.downloadMedia();
            if (!media) {
                console.error('Falha ao baixar o áudio.');
                await msg.reply('Falha ao baixar o áudio.');
                return;
            }
            console.log('DEBUG: media.mimetype =', media.mimetype, 'media.filename =', media.filename);
            // Salva o áudio como ogg para o Whisper
            const filePath = `./audio_${Date.now()}.ogg`;
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));

            // Envia o arquivo para o Whisper da OpenAI
            let transcript = null;
            try {
                const whisperForm = new FormData();
                whisperForm.append('file', fs.createReadStream(filePath));
                whisperForm.append('model', 'whisper-1');
                console.log('Enviando áudio para o Whisper...');
                const whisperResponse = await axios.post(
                    'https://api.openai.com/v1/audio/transcriptions',
                    whisperForm,
                    {
                        headers: {
                            ...whisperForm.getHeaders(),
                            'Authorization': 'Bearer API_KEY_OPENAI' // Substitua pela sua chave de API da OpenAI
                        }
                    }
                );
                transcript = whisperResponse.data.text;
                console.log('Transcrição Whisper:', transcript);
            } catch (err) {
                console.error('[Whisper API Error]', err.response ? err.response.data : err.message);
                await msg.reply('Erro ao transcrever o áudio.');
            }
            try { fs.unlinkSync(filePath); } catch (e) { console.error('Erro ao remover arquivo temporário:', e); }
            if (transcript) {
                // Envia o texto transcrito para a API da Bertha
                const payload = {
                    inputs: {},
                    query: transcript,
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
                        await msg.reply(response.data.answer);
                    } else {
                        console.log('[API Response] Sem resposta de texto.');
                    }
                } catch (err) {
                    console.error('[API Error]', err.response ? err.response.data : err.message);
                }
            } else if (!media) {
                await msg.reply('Não consegui transcrever o áudio.');
            }
            groupMessageCounters[chat.id._serialized] = 0;
            return;
        }

        // Só responde se a mensagem começar com 'Bertha', 'Berta' ou 'Beta' (case-insensitive)
        const lowered = messageText.trim().toLowerCase();
        if (
            lowered.startsWith('bertha') ||
            lowered.startsWith('berta') ||
            lowered.startsWith('beta')
        ) {
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
                    await msg.reply(response.data.answer);
                } else {
                    console.log('[API Response] Sem resposta de texto.');
                }
            } catch (err) {
                console.error('[API Error]', err.response ? err.response.data : err.message);
            }
            // Zera o contador após responder
            groupMessageCounters[chat.id._serialized] = 0;
        } else {
            // Incrementa o contador se não for mensagem para a Bertha/Berta/Beta
            groupMessageCounters[chat.id._serialized]++;
            if (groupMessageCounters[chat.id._serialized] >= 5) {
                await chat.sendMessage("Oi! Se quiser falar comigo, mande 'Bertha' no inicio da sua mensagem! 😊");
                groupMessageCounters[chat.id._serialized] = 0;
            }
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



