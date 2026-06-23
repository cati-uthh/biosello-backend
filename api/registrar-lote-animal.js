import { registrarNuevoLoteAnimal } from '../src/config/controllers/loteAnimalController.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Metodo no permitido'
    });
  }

  await registrarNuevoLoteAnimal(req, res);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

