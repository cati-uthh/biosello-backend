const express = require('express');
const app = express();
const PORT = 3000;

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('¡Servidor Express funcionando correctamente!');
});

// Escuchar en el puerto especificado
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});