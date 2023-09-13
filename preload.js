const { contextBridge } = require('electron');

// Expor funções ou variáveis do Node.js para a página renderizada de forma segura
contextBridge.exposeInMainWorld('myAPI', {
  doSomething: () => {
    // Sua função Node.js aqui
  },
});
