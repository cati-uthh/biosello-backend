import { registrarNuevoNegocio } from '../src/controllers/negocioController.js'

export default async function handler(req, res) {
  // Aseguramos cabeceras CORS básicas (útil si luego hacen un dashboard web)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Respuesta rápida para pre-flight requests (CORS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Filtrar métodos HTTP no permitidos
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  // Ejecutar el controlador
  await registrarNuevoNegocio(req, res);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Aumentamos el límite para permitir PDFs o fotos
    },
  },
};