import pool from '../src/config/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let connection;
  try {
    connection = await pool.getConnection();

    // GET: Obtener sucursales del negocio principal
    if (req.method === 'GET') {
      const idNegocio = Number(req.query.id_negocio);
      if (!idNegocio) {
        return res.status(400).json({ success: false, error: 'id_negocio es requerido' });
      }

      // Buscamos el negocio raíz (Matriz) y todas sus sucursales hijas
      const query = `
        SELECT 
          id_negocio, 
          nombre_negocio, 
          COALESCE(nombre_sucursal, 'Matriz') AS nombre_sucursal, 
          municipio, 
          direccion 
        FROM negocio 
        WHERE id_negocio = ? OR id_negocio_padre = ?
        ORDER BY id_negocio ASC
      `;

      const [rows] = await connection.execute(query, [idNegocio, idNegocio]);
      return res.status(200).json({ success: true, data: rows });
    }

    // POST: Registrar una nueva sucursal
    if (req.method === 'POST') {
      const { id_negocio_matriz, nombre_sucursal, municipio, direccion } = req.body || {};

      if (!id_negocio_matriz || !nombre_sucursal || !direccion) {
        return res.status(400).json({ success: false, error: 'Proporcione el nombre de sucursal y la dirección.' });
      }

      // Obtenemos los datos de la matriz para heredar RFC y Administrador
      const [matriz] = await connection.execute(
        'SELECT rfc, id_admin FROM negocio WHERE id_negocio = ? LIMIT 1',
        [id_negocio_matriz]
      );

      if (matriz.length === 0) {
        return res.status(404).json({ success: false, error: 'La empresa matriz no existe.' });
      }

      const { rfc, id_admin } = matriz[0];

      const queryInsert = `
        INSERT INTO negocio (nombre_negocio, nombre_sucursal, municipio, direccion, rfc, estatus_verificacion, id_admin, id_negocio_padre)
        VALUES ('Sucursal', ?, ?, ?, ?, 'aprobado', ?, ?)
      `;

      const [result] = await connection.execute(queryInsert, [
        nombre_sucursal.trim(),
        municipio?.trim() || 'Huejutla de Reyes',
        direccion.trim(),
        rfc,
        id_admin,
        id_negocio_matriz
      ]);

      return res.status(201).json({
        success: true,
        message: 'Sucursal registrada exitosamente.',
        data: {
          id_negocio: result.insertId,
          nombre_sucursal,
          direccion
        }
      });
    }

    return res.status(405).json({ success: false, error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en API sucursales:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    if (connection) connection.release();
  }
}