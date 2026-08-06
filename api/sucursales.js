import pool from '../src/config/db.js';
import { put } from '@vercel/blob';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let connection;
  try {
    connection = await pool.getConnection();

    // GET: Obtener sucursales
    if (req.method === 'GET') {
      const idNegocio = Number(req.query.id_negocio);
      if (!idNegocio) {
        return res.status(400).json({ success: false, error: 'id_negocio es requerido' });
      }

      const query = `
        SELECT 
          id_negocio, 
          nombre_negocio, 
          COALESCE(nombre_sucursal, 'Matriz') AS nombre_sucursal, 
          municipio, 
          direccion,
          estatus_verificacion,
          id_negocio_padre
        FROM negocio 
        WHERE id_negocio = ? OR id_negocio_padre = ?
        ORDER BY id_negocio ASC
      `;

      const [rows] = await connection.execute(query, [idNegocio, idNegocio]);
      return res.status(200).json({ success: true, data: rows });
    }

    // POST: Registrar sucursal
    if (req.method === 'POST') {
      const { id_negocio_matriz, nombre_sucursal, municipio, direccion, archivoBase64, nombreArchivo } = req.body || {};

      if (!id_negocio_matriz || !nombre_sucursal || !direccion || !archivoBase64) {
        return res.status(400).json({ success: false, error: 'Ingresa el nombre, dirección y adjunta el documento.' });
      }

      let documentoUrlFinal = null;
      if (archivoBase64 && nombreArchivo) {
        const buffer = Buffer.from(archivoBase64, 'base64');
        const blob = await put(`documentos/sucursales/${Date.now()}-${nombreArchivo}`, buffer, {
          access: 'private',
        });
        documentoUrlFinal = blob.url;
      }

      const [matriz] = await connection.execute(
        'SELECT rfc, id_admin FROM negocio WHERE id_negocio = ? LIMIT 1',
        [id_negocio_matriz]
      );

      if (matriz.length === 0) {
        return res.status(404).json({ success: false, error: 'La empresa matriz no existe.' });
      }

      const { rfc, id_admin } = matriz[0];

      const queryInsert = `
        INSERT INTO negocio (nombre_negocio, nombre_sucursal, municipio, direccion, rfc, documento_url, estatus_verificacion, id_admin, id_negocio_padre)
        VALUES ('Sucursal', ?, ?, ?, ?, ?, 'pendiente', ?, ?)
      `;

      const [result] = await connection.execute(queryInsert, [
        nombre_sucursal.trim(),
        municipio?.trim() || 'Huejutla de Reyes',
        direccion.trim(),
        rfc,
        documentoUrlFinal,
        id_admin,
        id_negocio_matriz
      ]);

      return res.status(201).json({
        success: true,
        message: 'Sucursal registrada exitosamente.',
        data: { id_negocio: result.insertId, nombre_sucursal, direccion, estatus_verificacion: 'pendiente' }
      });
    }

    // PUT: Modificar sucursal (pasa a estatus 'pendiente' de re-verificación)
    if (req.method === 'PUT') {
      const { id_sucursal, nombre_sucursal, direccion, municipio, archivoBase64, nombreArchivo } = req.body || {};

      if (!id_sucursal || !nombre_sucursal || !direccion) {
        return res.status(400).json({ success: false, error: 'Datos incompletos para actualizar.' });
      }

      let documentoUrlFinal = null;
      if (archivoBase64 && nombreArchivo) {
        const buffer = Buffer.from(archivoBase64, 'base64');
        const blob = await put(`documentos/sucursales/${Date.now()}-${nombreArchivo}`, buffer, {
          access: 'private',
        });
        documentoUrlFinal = blob.url;
      }

      let queryUpdate = `
        UPDATE negocio 
        SET nombre_sucursal = ?, direccion = ?, municipio = ?, estatus_verificacion = 'pendiente'
      `;
      const params = [nombre_sucursal.trim(), direccion.trim(), municipio?.trim() || 'Huejutla de Reyes'];

      if (documentoUrlFinal) {
        queryUpdate += `, documento_url = ?`;
        params.push(documentoUrlFinal);
      }

      queryUpdate += ` WHERE id_negocio = ?`;
      params.push(id_sucursal);

      await connection.execute(queryUpdate, params);

      return res.status(200).json({
        success: true,
        message: 'Sucursal actualizada. Ha vuelto a estado pendiente de verificación.'
      });
    }

    // DELETE: Eliminar sucursal previa verificación de contraseña del dueño
    if (req.method === 'DELETE') {
      const { id_sucursal, id_usuario, contrasena } = req.body || {};

      if (!id_sucursal || !id_usuario || !contrasena) {
        return res.status(400).json({ success: false, error: 'Ingresa tu contraseña para confirmar el borrado.' });
      }

      // Validar identidad del usuario
      const [userRows] = await connection.execute(
        'SELECT contrasena_hash FROM usuario WHERE id_usuario = ? LIMIT 1',
        [id_usuario]
      );

      if (userRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
      }

      const contrasenaValida = await bcrypt.compare(contrasena, userRows[0].contrasena_hash);
      if (!contrasenaValida) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta. No se pudo eliminar la sucursal.' });
      }

      // Eliminar la sucursal (por CASCADE se eliminan lotes o registros vinculados)
      await connection.execute('DELETE FROM negocio WHERE id_negocio = ?', [id_sucursal]);

      return res.status(200).json({
        success: true,
        message: 'Sucursal eliminada permanentemente.'
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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};