// document.addEventListener("DOMContentLoaded", login);

//esconder campos de login e solicitar para a API um codigo que será convertido em QRCODE
function login(canLoad = true) {
    if(canLoad){
        document.getElementById("loader").style.display = "inline-block";
        document.getElementById("blackBox").style.display = "inline-block";
    }
    document.getElementById("login").style.display = "none";



    // solicitação HTTP para o servidor do ZAP usando o objeto XMLHttpRequest:
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "http://localhost:3000/qrcode"); //  URL da API.
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            // var response = JSON.parse(xhr.responseText);
            console.log('Resposta da API:', xhr.responseText);
            if (xhr.responseText === "isConnected") {
                isLoggedIn();
            } else {
                //gerar QRcode com a resposta do servidor
                genQR(xhr.responseText);
                //rodar o codigo novamente para atualizar o QRCODE
                login(false);
                //verificar continuamente quando o usuário é logado
                VerifyLogin();
    
            }
        } else if (xhr.readyState === 4) {
            console.error('Erro ao fazer a solicitação GET:', xhr.statusText);
        }
    };
    xhr.send();


}


function isLoggedIn() {
    //esconder alguns campos e ajustar o tamanho da div ao logar
    document.getElementById("cBox").style.width = "auto";
    document.getElementById("cBox").style.height = "auto";
    document.getElementById("blackBox").style.display = "none";
    document.getElementById("loader").style.display = "none";
    document.getElementById("qrcode").style.display = "none";
    document.getElementById("messageSender").style.display = "inline-block";

}


function VerifyLogin() {
    //verificar continuamente se o usuario ja escaneou o WhatsApp
    fetch('http://localhost:3000/isLog', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(response => response.text()).then(result => {
        console.log(result);
        if (result == "no") {
            //caso ainda não tenha logado,a verificação roda novamente
            VerifyLogin();
        } else if (result == "yes") {
            //usuário logou
            isLoggedIn();
        }
    }).catch(error => {
        console.error('Erro ao enviar dados:', error);
    });
}

function genQR(qrC) {
    //zerar qualquer QRCODE existente antes de gerar um novo
    document.getElementById("qrcode").innerHTML = '';

    // Recebe o conteudo do QRCODE
    const qrCodeText = qrC;

    // Crie um elemento para o QRCODE
    const qrcode = new QRCode(document.getElementById("qrcode"), {text: qrCodeText});

    // Converta o QRCODE em uma imagem
    document.getElementById("blackBox").style.display = "none";
    document.getElementById("loader").style.display = "none";
    document.getElementById("qrcode").style.display = "inline-block";
    document.getElementById("cBox").style.borderRadius = "10px";
    document.getElementById("cBox").style.width = "60vh";
}

//Informações armazenadas paras disparos
var nomeTelefoneList = [];

//update do nomeTelefoneList ao carregar uma planilha
document.getElementById('Minput1').addEventListener('change', function (e) {
    nomeTelefoneList = [];
    var file = e.target.files[0];
    var reader = new FileReader();

    reader.onload = function (e) {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, {type: 'array'});

        // Suponha que a planilha desejada esteja na primeira folha (índice 0)
        var sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Converter a planilha em uma matriz de objetos
        var sheetData = XLSX.utils.sheet_to_json(sheet);

        // Iterar pelos dados da planilha
        var listaHTML = document.getElementById('lista');
        listaHTML.innerHTML = "";

        sheetData.forEach(function (row) {
            // Verificar se as colunas Nome e Telefone existem
            if (row.ordem && row.mensagem && row.telefone) {
                // Adicionar os dados de Nome e Telefone à lista
                nomeTelefoneList.push({Atraso: row.ordem, Mensagem: row.mensagem, Telefone: row.telefone});

                // Criar um elemento <li>
                var listItem = document.createElement('li');

                // Cria uma string com os dados coletados
                listItem.innerHTML = ' WhatsApp:<strong> ' + row.telefone + '</strong> <br> ordem de disparo: '+ row.ordem +'º<br><br> Mensagem:<br>' + row.mensagem + "<br>" ;
                
                // imprimir os dados para o usuario
                listaHTML.appendChild(listItem);
            }
        });
    };

    reader.readAsArrayBuffer(file);
});


function enviarDadosParaAPI() {
    if (nomeTelefoneList.length === 0) {
        alert("A lista está vazia. Carregue um arquivo Excel primeiro.");
        return;
    }

    // Iterar pela lista de Nome e Telefone e enviar para a API
    nomeTelefoneList.forEach(function (entry) {
        var dataToSend = {
            phoneNumber: entry.Telefone,
            message: entry.Mensagem, // Essa é a mensagem que vais er disparada para o contato (Nos disparos ela é definida individualmente pela planilha)
            delay: entry.Atraso //Index do numero que é convertido em atraso para as mensagens serem sequenciais, ao invés de serem disparadas todas juntas.
        };

        //a API suporta somente 1 disparo por request, a função abaixo gera um delay entre cada dado enviado para os requests não serem enviados todos de uma vez
        enviarParaAPI(dataToSend);
    });

    // Limpar a lista após o envio dos dados
    nomeTelefoneList = [];
}

// Função para enviar os dados para a API do ZAP 
function enviarParaAPI(data) {

    setTimeout(function () {
        fetch('http://localhost:3000/receiver', { //URL de disparos
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data) //Integrar dados do disparo no corpo do request
        }).then(response => response.json()).then(result => {
            console.log('Dados enviados com sucesso:', result);
        }).catch(error => {
            console.error('Erro ao enviar dados:', error);
        });
    }, Number(data.delay) * 1000 + 500); //disparar cada mensagem sequencialmente, mas com um atraso de 0.5 segundos entre cada um.
}
