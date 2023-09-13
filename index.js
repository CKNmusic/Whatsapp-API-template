const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const multer = require('multer');
const csv = require('csv-parser');
const bodyParser = require('body-parser');
const Axios = require('axios');
const express = require('express');
const cors = require('cors');



// Resto do código...


/*let mainWindow;
global.sharedData = {
    message: 'Hello from the main process!',
  };

function createWindow() {
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {// Caminho para o arquivo preload.js
        nodeIntegration: true // Permitir integração com Node.js
      }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('set-dirname', __dirname);
      });
  
    mainWindow.loadFile('index.html');
  
  
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }
  
  myApp.on('ready', createWindow);
  
  myApp.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        myApp.quit();
    }
  });
  
  myApp.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
*/

// Configuração para o multer (para upload de arquivos)
const app = express();
app.use(cors());
const port = 3000;
var isLogged = false;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const client = new Client();
const conversations = new Map(); // Mapa para associar chats a arrays de conversa
const clients = new Map(); // Mapa para associar chats a arrays de conversa

app.listen(port,'0.0.0.0',()=>{
      console.log("server is listening " + port);
});


client.initialize();

const introduction = [
    "Olá, tudo bem? Sou a atendente virtual da Digital Saúde.\nPara continuarmos com nosso atendimento, preciso que me informe o seu *nome completo*",
    "Oiii, tudo bem? Sou a atendente virtual da Digital Saúde.\nAntes de iniciarmos a nossa conversa, preciso de algumas informações. *Qual o seu nome?*",
    "E aí, tudo bem? Sou a atendente virtual da Digital Saúde.\nPara um melhor atendimento, preciso de algumas informações suas, ok? *Qual o seu nome?*"
];

const email = [
    "Perfeito, agora eu preciso do seu *email.*",
    "Perfeito, agora me diga o seu *email.*",
    "Perfeito! Agora precisamos do seu email para continuar.",
    "Excelente! Agora, por favor, informe seu email.",
    "Ótimo! Agora precisamos que você nos forneça seu email para continuar."
];

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header('content-type', 'application/json');
    next();
  });


  //Gerar o QRCode && Verificar se o usuario ja esta online

app.get('/qrcode', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if(!isLogged){
          let qr = await new Promise((resolve, reject) => {
              client.once('qr', (qr) => resolve(qr))
          })
          res.send(qr)
        }else{
            res.send("isConnected");
        }


});

app.get('/test', async (req, res) => {res.send("https://doutormultas.com.br/wp-content/uploads/2016/12/qrcode.jpg")});
app.get('/isLog', async (req, res) => {if(isLogged){res.send("yes")}else{res.send("no")}});

  //Disparar mensagem para contato vindo de um WebHook
app.post('/receiver', async (req, res) => {
    try {
      const phoneNumber = req.body.phoneNumber; // Número de telefone
      const message = req.body.message; // Número de telefone
      var introIndex = randomRange(1, 3); // Mensagem a ser enviada
  
      // Verifica se o cliente do WhatsApp está pronto
      if (isLogged) {
        const chat = await client.getChatById(phoneNumber + '@c.us'); // ID do chat com o número
  
        // Envia a mensagem
        await chat.sendMessage(message);
  
        res.send('Mensagem enviada com sucesso!');
      } else {
        res.status(500).send('O cliente do WhatsApp não está pronto. Aguarde a inicialização.');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Erro ao enviar a mensagem.');
    }
  });



  


client.on('ready', () => {
    console.log('Client is ready!');
    isLogged = true;
});


client.on('message', message => {
    if(message.body === '!ping') {
        message.reply('pong');
	}
});

client.on('message', message => {
    const chatId = message.from;
	if(message.body.startsWith('!!.')) {
        
        if (!clients.has(chatId)) {
            var introIndex = randomRange(1, 3);
            message.reply(introduction[introIndex - 1]);
            clients.set(chatId, []);
            var clientState = {
                state: 1
            };
            clients.set(chatId, clientState);
            console.log(clients.get(chatId).state);
            return;
        }

        if(clients.has(chatId) && clients.get(chatId).state == 1){
            var introIndex = randomRange(1, 5);


            var clientName = {
                clientName: message.body
            };
            clients.set(chatId, clientName);

            clients.get(chatId).state = 2;
            message.reply(email[introIndex - 1]); 
            console.log(clients.get(chatId).name);
            return;
            
        }

        if(clients.has(chatId) && clients.get(chatId).state == 2){
            var introIndex = randomRange(1, 5);
            
            clients.get(chatId).email = {
                value: message.body
            };
            clients.get(chatId).state = 3;
            console.log(clients.get(chatId).email);
            message.reply("Certinho, " + clients.get(chatId).clientName + ", ja anotamos seus dados aqui. Em que posso ajudar?");
            return;
        }

        if(clients.has(chatId) && clients.get(chatId).state == 3){


            if (!conversations.has(chatId)) {
                conversations.set(chatId, []);
                conversations.get(chatId).push({
                    Role: 'system',
                    Content: 'esse cliente acabou de mandar os dados dele, o nome dele é '
                     + clients.get(chatId).clientName + 
                     ', não esqueça o nome dele. foque apenas em solucionar as dúvidas dele em relação ao plano de Saúde em que ele está interessado. Os dados desse cliente já estão na nossa base de dados a essa altura da conversa, então foque apenas nas informações e não na venda'
                });
            }
    
            const conversation = conversations.get(chatId);
            const name = conversations.size + 1;
            const newMessage = {
                Role: 'user',
                Content: message.body
            };
            conversation.push(newMessage);
            console.log(newMessage);
    
                let data = {"Model":"GPT-4","Provider":"DeepAi","Messages":conversation};
    
                let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: 'http://3.227.136.47:8000/api/v1/chat/completions',
                headers: { 
                    'Content-Type': 'application/json;charset=utf-8'
                },
                data : data
                };
    
                 Axios.request(config)
                .then((response) => {
                console.log(JSON.stringify(response.data.Data.Answer));
                client.sendMessage(message.from, response.data.Data.Answer);
                    const name2 = conversations.size + 1;
                    const recMessage = {
                        Role: 'assistant',
                        Content: response.data.Data.Answer // Use the same response as in sendMessage
                    };
                    conversation.push(recMessage);
                })
                .catch((error) => {
                console.log(error);
                });
                return;
        }
        }
});


// Make sure 'client' and 'conversations' are defined properly

client.on('message', async message => {
    console.log(message.from +":"+ message.body);
    const chatId = message.from;

    if (message.body.startsWith('!gpt')) {


        if (!conversations.has(chatId)) {
            conversations.set(chatId, []);
        }

        const conversation = conversations.get(chatId);
        const name = conversations.size + 1;
        const newMessage = {
            Role: 'user',
            Content: message.body
        };
        conversation.push(newMessage);
        console.log(newMessage);

            let data = {"Model":"GPT-4","Provider":"DeepAi","Messages":conversation};

            let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'http://3.227.136.47:8000/api/v1/chat/completions',
            headers: { 
                'Content-Type': 'application/json;charset=utf-8'
            },
            data : data
            };

             Axios.request(config)
            .then((response) => {
            console.log(JSON.stringify(response.data.Data.Answer));
            client.sendMessage(message.from, response.data.Data.Answer);
                const name2 = conversations.size + 1;
                const recMessage = {
                    Role: 'assistant',
                    Content: response.data.Data.Answer // Use the same response as in sendMessage
                };
                conversation.push(recMessage);
            })
            .catch((error) => {
            console.log(error);
            });

    }
});


            async function identifier(doc){
                let nome = '';

                for (const entidade of doc.ents) {
                  if (entidade.label_ === 'PERSON') {
                    nome = entidade.text;
                    break; // Pare após encontrar o primeiro nome
                  }
                }
              
                console.log(nome);
            }

            
            function randomRange(min, max) {
                // Gere um número decimal aleatório entre 0 (inclusivo) e 1 (exclusivo)
                const randomDecimal = Math.random();
              
                // Mapeie o número decimal para o intervalo [min, max]
                const randomInteger = Math.floor(randomDecimal * (max - min + 1)) + min;
              
                return randomInteger;
              }



