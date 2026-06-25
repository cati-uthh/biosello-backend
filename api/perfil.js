import { consultarPerfil, guardarPerfil } from '../src/config/controllers/perfilController.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return consultarPerfil(req, res);
  }

  if (req.method === 'PUT') {
    return guardarPerfil(req, res);
  }

  return res.status(405).json({ success: false, error: 'Método no permitido' });
}
