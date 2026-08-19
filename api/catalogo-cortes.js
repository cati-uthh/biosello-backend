import pool from '../src/config/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const especie = String(req.query?.especie || 'BOVINO').toUpperCase();

  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT id_corte, especie, categoria, nombre_corte, tip_cuidado, recomendacion FROM catalogo_corte WHERE especie = ? ORDER BY id_corte ASC',
      [especie]
    );

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error en catalogo-cortes:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    if (connection) connection.release();
  }
}
