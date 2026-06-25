import pool from '../db';

const crearError = (message, statusCode = 400, code = 'REQUEST_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

export const obtenerPerfil = async (idUsuario) => {
  const [rows] = await pool.execute(
    `
      SELECT
        u.id_usuario,
        u.nombre,
        u.email,
        u.telefono,
        u.perfil,
        u.activo,
        n.id_negocio,
        n.nombre_negocio,
        n.municipio,
        n.direccion,
        n.rfc,
        n.estatus_verificacion
      FROM usuario u
      LEFT JOIN negocio n ON n.id_admin = u.id_usuario
      WHERE u.id_usuario = ?
      LIMIT 1
    `,
    [idUsuario]
  );

  if (rows.length === 0) {
    throw crearError('El usuario indicado no existe.', 404, 'USUARIO_NOT_FOUND');
  }

  return rows[0];
};

export const actualizarPerfil = async ({ idUsuario, nombre, email, telefono, nombreNegocio, municipio, direccion, rfc }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [duplicado] = await connection.execute(
      'SELECT id_usuario FROM usuario WHERE email = ? AND id_usuario <> ? LIMIT 1',
      [email, idUsuario]
    );

    if (duplicado.length > 0) {
      throw crearError('Ese correo electrónico ya está registrado en otra cuenta.', 409, 'EMAIL_DUPLICADO');
    }

    await connection.execute(
      'UPDATE usuario SET nombre = ?, email = ?, telefono = ? WHERE id_usuario = ?',
      [nombre, email, telefono, idUsuario]
    );

    await connection.execute(
      `
        UPDATE negocio
        SET nombre_negocio = ?,
            municipio = ?,
            direccion = ?,
            rfc = ?
        WHERE id_admin = ?
      `,
      [nombreNegocio, municipio, direccion, rfc, idUsuario]
    );

    await connection.commit();
    return obtenerPerfil(idUsuario);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
