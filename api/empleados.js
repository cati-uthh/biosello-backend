import {
  actualizarEmpleado,
  crearEmpleado,
  eliminarEmpleado,
  listarEmpleados,
} from '../src/config/controllers/empleadoController.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return listarEmpleados(req, res);
  if (req.method === 'POST') return crearEmpleado(req, res);
  if (req.method === 'PUT') return actualizarEmpleado(req, res);
  if (req.method === 'DELETE') return eliminarEmpleado(req, res);

  return res.status(405).json({
    success: false,
    error: 'Método no permitido.',
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
