import { actualizarEstadoLote, consultarLotes, editarLoteAnimal, eliminarLoteAnimal } from '../src/config/controllers/loteAnimalController.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return consultarLotes(req, res);
  }

  if (req.method === 'PATCH') {
    return actualizarEstadoLote(req, res);
  }

  if (req.method === 'PUT') {
    return editarLoteAnimal(req, res);
  }

  if (req.method === 'DELETE') {
    return eliminarLoteAnimal(req, res);
  }

  return res.status(405).json({
    success: false,
    error: 'Metodo no permitido'
  });
}
