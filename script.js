
//document.addEventListener("DOMContentLoaded", login);

function login() {
  document.getElementById("login").style.display = "none";
  document.getElementById("loader").style.display = "inline-block";
  document.getElementById("blackBox").style.display = "inline-block";

  // Como não podemos usar o Node.js no navegador, você não pode fazer solicitações HTTP para 'localhost:3000' diretamente aqui.
  // Você precisará fornecer uma URL real para sua API ou servidor.

  // Exemplo de como fazer uma solicitação HTTP usando o objeto XMLHttpRequest:
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "http://localhost:3000/qrcode"); // Substitua "https://sua-url-api-aqui.com" pela URL da sua API.
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      //var response = JSON.parse(xhr.responseText);
      console.log('Resposta da API:', xhr.responseText);
      if (xhr.responseText === "isConnected") {
        isLoggedIn();
      } else {
        genQR(xhr.responseText);
        VerifyLogin();
        //isLoggedIn();
      }
    } else if (xhr.readyState === 4) {
      console.error('Erro ao fazer a solicitação GET:', xhr.statusText);
    }
  };
  xhr.send();
    


}


function isLoggedIn() {
  document.getElementById("cBox").style.width = "80%";
  document.getElementById("cBox").style.height = "80%";
  document.getElementById("blackBox").style.display = "none";
  document.getElementById("loader").style.display = "none";
  document.getElementById("qrcode").style.display = "none";
  document.getElementById("messageSender").style.display = "inline-block";

}


function VerifyLogin(){
  fetch('http://localhost:3000/isLog', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(response => response.text())
  .then(result => {
    console.log(result);
    if(result == "no"){
      VerifyLogin();
    }else if(result == "yes"){
      isLoggedIn();
    }
  })
  .catch(error => {
    console.error('Erro ao enviar dados:', error);
  });
}

function genQR(qrC) {
  // Selecione o elemento canvas
  const qrCodeText = qrC; // Substitua pelo seu código QR real

  // Crie um elemento para o QR code
  const qrcode = new QRCode(document.getElementById("qrcode"), {
      text: qrCodeText
  });

  // Converta o QR code em uma imagem
  //const imgDataUrl = document.getElementById("qrcode").getElementsByTagName("img")[0].src;

  document.getElementById("blackBox").style.display = "none";
  document.getElementById("loader").style.display = "none";
  document.getElementById("qrcode").style.display = "inline-block";

  document.getElementById("cBox").style.borderRadius = "10px";
  document.getElementById("cBox").style.width = "60vh";
}

var nomeTelefoneList = [];

document.getElementById('Minput1').addEventListener('change', function(e) {
  nomeTelefoneList = [];
  var file = e.target.files[0];
  var reader = new FileReader();

  reader.onload = function(e) {
    var data = new Uint8Array(e.target.result);
    var workbook = XLSX.read(data, { type: 'array' });

    // Suponha que a planilha desejada esteja na primeira folha (índice 0)
    var sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Converter a planilha em uma matriz de objetos
    var sheetData = XLSX.utils.sheet_to_json(sheet);

    // Iterar pelos dados da planilha
    sheetData.forEach(function(row) {
      // Verificar se as colunas Nome e Telefone existem
      if (row.Mensagem && row.Telefone) {
        // Adicionar os dados de Nome e Telefone à lista
        nomeTelefoneList.push({ Mensagem: row.Mensagem, Telefone: row.Telefone });
      }
    });
  };

  console.log(nomeTelefoneList);
  renderizarLista(nomeTelefoneList);
  reader.readAsArrayBuffer(file);
});


function enviarDadosParaAPI() {
  if (nomeTelefoneList.length === 0) {
    alert("A lista está vazia. Carregue um arquivo Excel primeiro.");
    return;
  }

  // Iterar pela lista de Nome e Telefone e enviar para a API
  nomeTelefoneList.forEach(function(entry) {
    var dataToSend = {
      phoneNumber: entry.Telefone,
      message: entry.Mensagem // Substitua pela mensagem desejada
    };

    // Enviar dataToSend para a API
    enviarParaAPI(dataToSend);
    renderizarLista(nomeTelefoneList);
  });

  // Limpar a lista após o envio dos dados
  nomeTelefoneList = [];
}

// Função para enviar os dados para a API (substitua com sua lógica de envio)
function enviarParaAPI(data) {
  // Use fetch ou outra biblioteca para enviar os dados para a API
  // Substitua a URL abaixo pela URL da sua API
  fetch('http://localhost:3000/receiver', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    console.log('Dados enviados com sucesso:', result);
  })
  .catch(error => {
    console.error('Erro ao enviar dados:', error);
  });
}


function renderizarLista(data) {
  var listaHTML = document.getElementById('lista');
  listaHTML.innerHTML = '';

  data.forEach(function (item) {
      var listItem = document.createElement('li');
      listItem.textContent = item.Nome + ' | ' + item.Mensagem;
      listaHTML.appendChild(listItem);
  });
}
