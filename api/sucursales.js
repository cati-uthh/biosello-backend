import pool from '../src/config/db.js';
import bcrypt from 'bcryptjs';
import { validarAccesoNegocio } from '../src/config/services/autorizacionService.js';
import { obtenerAdministradorRequest } from '../src/config/utils/auth.js';
import { eliminarDocumentoPublico, subirDocumentoPublico } from '../src/config/utils/documentoBlob.js';

const limpiarCargaFallida = async (urlDocumento) => {
  if (!urlDocumento) return;
  try {
    await eliminarDocumentoPublico(urlDocumento);
  } catch (error) {
    console.error('No se pudo limpiar el documento de una carga fallida:', error);
  }
};

const enteroPositivo = (valor) => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
};

const responderError = (res, error) => {
  console.error('Error en API sucursales:', error);
  return res.status(error?.statusCode || 500).json({
    success: false,
    error: error?.statusCode ? error.message : 'Error interno del servidor',
    code: error?.code || 'INTERNAL_ERROR',
  });
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let connection;
  try {
    const sesion = obtenerAdministradorRequest(
      req,
      'Solo una cuenta administradora puede gestionar sucursales.'
    );
    connection = await pool.getConnection();

    // GET: Obtener sucursales
    if (req.method === 'GET') {
      const idNegocio = enteroPositivo(req.query.id_negocio);
      if (!idNegocio) {
        return res.status(400).json({ success: false, error: 'id_negocio es requerido' });
      }

      const negocioSeleccionado = await validarAccesoNegocio(connection, {
        idNegocio,
        sesion,
        soloAdministrador: true,
      });
      const idMatriz = negocioSeleccionado.id_negocio_padre || negocioSeleccionado.id_negocio;
      await validarAccesoNegocio(connection, {
        idNegocio: idMatriz,
        sesion,
        soloAdministrador: true,
      });

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
        WHERE id_admin = ?
          AND (id_negocio = ? OR id_negocio_padre = ?)
        ORDER BY id_negocio ASC
      `;

      const [rows] = await connection.execute(query, [sesion.idUsuario, idMatriz, idMatriz]);
      return res.status(200).json({ success: true, data: rows });
    }

    // POST: Registrar sucursal
    if (req.method === 'POST') {
      const { nombre_sucursal, municipio, direccion, archivoBase64, nombreArchivo } = req.body || {};
      const idNegocioMatriz = enteroPositivo(req.body?.id_negocio_matriz);

      if (!idNegocioMatriz || !nombre_sucursal?.trim() || !direccion?.trim() || !archivoBase64 || !nombreArchivo) {
        return res.status(400).json({ success: false, error: 'Ingresa el nombre, dirección y adjunta el documento.' });
      }
      if (nombre_sucursal.trim().length > 100 || direccion.trim().length > 255 || String(municipio || '').trim().length > 100) {
        return res.status(400).json({ success: false, error: 'El nombre, municipio o dirección exceden el tamaño permitido.' });
      }

      const matrizAutorizada = await validarAccesoNegocio(connection, {
        idNegocio: idNegocioMatriz,
        sesion,
        soloAdministrador: true,
      });
      if (matrizAutorizada.id_negocio_padre) {
        return res.status(400).json({
          success: false,
          error: 'Las sucursales solo pueden registrarse bajo el negocio matriz.',
          code: 'MATRIZ_REQUERIDA',
        });
      }

      const [matriz] = await connection.execute(
        'SELECT rfc, id_admin FROM negocio WHERE id_negocio = ? LIMIT 1',
        [idNegocioMatriz]
      );

      if (matriz.length === 0) {
        return res.status(404).json({ success: false, error: 'La empresa matriz no existe.' });
      }

      const { rfc, id_admin } = matriz[0];
      let documentoUrlFinal = null;

      try {
        documentoUrlFinal = await subirDocumentoPublico({
          archivoBase64,
          nombreArchivo,
          carpeta: `documentos/sucursales/${idNegocioMatriz}`,
        });

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
          idNegocioMatriz
        ]);

        return res.status(201).json({
          success: true,
          message: 'Sucursal registrada exitosamente.',
          data: { id_negocio: result.insertId, nombre_sucursal, direccion, estatus_verificacion: 'pendiente' }
        });
      } catch (error) {
        await limpiarCargaFallida(documentoUrlFinal);
        throw error;
      }
    }

    // PUT: Modificar sucursal (pasa a estatus 'pendiente' de re-verificación)
    if (req.method === 'PUT') {
      const { nombre_sucursal, direccion, municipio, archivoBase64, nombreArchivo } = req.body || {};
      const idSucursal = enteroPositivo(req.body?.id_sucursal);

      if (!idSucursal || !nombre_sucursal?.trim() || !direccion?.trim()) {
        return res.status(400).json({ success: false, error: 'Datos incompletos para actualizar.' });
      }
      if (nombre_sucursal.trim().length > 100 || direccion.trim().length > 255 || String(municipio || '').trim().length > 100) {
        return res.status(400).json({ success: false, error: 'El nombre, municipio o dirección exceden el tamaño permitido.' });
      }

      const sucursalAutorizada = await validarAccesoNegocio(connection, {
        idNegocio: idSucursal,
        sesion,
        soloAdministrador: true,
      });
      if (!sucursalAutorizada.id_negocio_padre) {
        return res.status(400).json({
          success: false,
          error: 'El negocio matriz no puede editarse desde el módulo de sucursales.',
          code: 'SUCURSAL_REQUERIDA',
        });
      }

      let documentoUrlFinal = null;
      if (archivoBase64 || nombreArchivo) {
        if (!archivoBase64 || !nombreArchivo) {
          return res.status(400).json({
            success: false,
            error: 'El contenido y nombre del nuevo documento deben enviarse juntos.',
          });
        }
        documentoUrlFinal = await subirDocumentoPublico({
          archivoBase64,
          nombreArchivo,
          carpeta: `documentos/sucursales/${sucursalAutorizada.id_negocio_padre}`,
        });
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

      queryUpdate += ` WHERE id_negocio = ? AND id_admin = ? AND id_negocio_padre IS NOT NULL`;
      params.push(idSucursal, sesion.idUsuario);

      let resultado;
      try {
        [resultado] = await connection.execute(queryUpdate, params);
      } catch (error) {
        await limpiarCargaFallida(documentoUrlFinal);
        throw error;
      }
      if (resultado.affectedRows === 0) {
        await limpiarCargaFallida(documentoUrlFinal);
        return res.status(404).json({ success: false, error: 'La sucursal indicada no existe.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Sucursal actualizada. Ha vuelto a estado pendiente de verificación.'
      });
    }

    // DELETE: Eliminar sucursal previa verificación de contraseña del dueño
    if (req.method === 'DELETE') {
      const { contrasena } = req.body || {};
      const idSucursal = enteroPositivo(req.body?.id_sucursal);

      if (!idSucursal || !contrasena) {
        return res.status(400).json({ success: false, error: 'Ingresa tu contraseña para confirmar el borrado.' });
      }

      const sucursalAutorizada = await validarAccesoNegocio(connection, {
        idNegocio: idSucursal,
        sesion,
        soloAdministrador: true,
      });
      if (!sucursalAutorizada.id_negocio_padre) {
        return res.status(400).json({
          success: false,
          error: 'El negocio matriz no puede eliminarse desde el módulo de sucursales.',
          code: 'SUCURSAL_REQUERIDA',
        });
      }

      // Validar identidad del usuario
      const [userRows] = await connection.execute(
        'SELECT contrasena_hash FROM usuario WHERE id_usuario = ? LIMIT 1',
        [sesion.idUsuario]
      );

      if (userRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
      }

      const contrasenaValida = await bcrypt.compare(contrasena, userRows[0].contrasena_hash);
      if (!contrasenaValida) {
        return res.status(401).json({
          success: false,
          error: 'Contraseña incorrecta. No se pudo eliminar la sucursal.',
          code: 'INVALID_PASSWORD',
        });
      }

      // Eliminar la sucursal (por CASCADE se eliminan lotes o registros vinculados)
      const [resultado] = await connection.execute(
        'DELETE FROM negocio WHERE id_negocio = ? AND id_admin = ? AND id_negocio_padre IS NOT NULL',
        [idSucursal, sesion.idUsuario]
      );
      if (resultado.affectedRows === 0) {
        return res.status(404).json({ success: false, error: 'La sucursal indicada no existe.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Sucursal eliminada permanentemente.'
      });
    }

    return res.status(405).json({ success: false, error: 'Método no permitido' });
  } catch (error) {
    return responderError(res, error);
  } finally {
    if (connection) connection.release();
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '7mb',
    },
  },
};
