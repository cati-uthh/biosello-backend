import pool from '../db';
import bcrypt from 'bcryptjs';
import { eliminarDocumentoPublico, subirDocumentoPublico } from '../utils/documentoBlob.js';

const crearError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

export const registrarNegocio = async (datosNegocio) => {
  const {
    nombre, email, telefono, contrasena,
    nombre_negocio, municipio, direccion, rfc, 
    archivoBase64, nombreArchivo // <--- Recibimos el archivo en texto
  } = datosNegocio;

  const connection = await pool.getConnection();
  let documentoUrlFinal = null;
  let transaccionIniciada = false;

  try {
    const [usuariosExistentes] = await connection.execute(
      'SELECT email, telefono FROM usuario WHERE email = ? OR telefono = ? LIMIT 1',
      [email, telefono]
    );
    if (usuariosExistentes.length > 0) {
      const emailDuplicado = usuariosExistentes.some(
        (usuario) => String(usuario.email || '').toLowerCase() === String(email || '').toLowerCase()
      );
      throw crearError(
        emailDuplicado
          ? 'Ese correo electronico ya se encuentra registrado.'
          : 'Ese numero de telefono ya se encuentra registrado.',
        409,
        emailDuplicado ? 'EMAIL_DUPLICADO' : 'TELEFONO_DUPLICADO'
      );
    }

    const [negociosExistentes] = await connection.execute(
      'SELECT id_negocio FROM negocio WHERE rfc = ? LIMIT 1',
      [rfc]
    );
    if (negociosExistentes.length > 0) {
      throw crearError('Ese RFC ya se encuentra registrado.', 409, 'RFC_DUPLICADO');
    }

    const saltRounds = 10;
    const contrasenaHash = await bcrypt.hash(contrasena, saltRounds);

    if (archivoBase64 && nombreArchivo) {
      documentoUrlFinal = await subirDocumentoPublico({
        archivoBase64,
        nombreArchivo,
        carpeta: 'documentos/negocios',
      });
    }

    await connection.beginTransaction();
    transaccionIniciada = true;

    const queryUser = `
      INSERT INTO usuario (nombre, email, telefono, contrasena_hash, perfil, activo)
      VALUES (?, ?, ?, ?, 'admin', 1)
    `;
    const [userResult] = await connection.execute(queryUser, [nombre, email, telefono, contrasenaHash]);
    const idAdmin = userResult.insertId;

    const queryNegocio = `
      INSERT INTO negocio (nombre_negocio, municipio, direccion, rfc, documento_url, estatus_verificacion, id_admin)
      VALUES (?, ?, ?, ?, ?, 'pendiente', ?)
    `;
    await connection.execute(queryNegocio, [nombre_negocio, municipio, direccion, rfc, documentoUrlFinal, idAdmin]);

    await connection.commit();
    transaccionIniciada = false;
    return { success: true };

  } catch (error) {
    if (transaccionIniciada) {
      await connection.rollback();
    }
    if (documentoUrlFinal) {
      try {
        await eliminarDocumentoPublico(documentoUrlFinal);
      } catch (errorEliminacion) {
        console.error('No se pudo eliminar el documento huerfano de Blob:', errorEliminacion);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
};
