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
        COALESCE(negocio_admin.id_negocio, negocio_empleado.id_negocio) AS id_negocio,
        COALESCE(negocio_admin.nombre_negocio, negocio_empleado.nombre_negocio) AS nombre_negocio,
        COALESCE(negocio_admin.municipio, negocio_empleado.municipio) AS municipio,
        COALESCE(negocio_admin.direccion, negocio_empleado.direccion) AS direccion,
        COALESCE(negocio_admin.rfc, negocio_empleado.rfc) AS rfc,
        COALESCE(negocio_admin.estatus_verificacion, negocio_empleado.estatus_verificacion) AS estatus_verificacion,
        en.puesto
      FROM usuario u
      LEFT JOIN negocio negocio_admin ON negocio_admin.id_admin = u.id_usuario
      LEFT JOIN empleado_negocio en ON en.id_usuario = u.id_usuario AND en.activo = 1
      LEFT JOIN negocio negocio_empleado ON negocio_empleado.id_negocio = en.id_negocio
      WHERE u.id_usuario = ?
      ORDER BY negocio_admin.id_negocio_padre IS NULL DESC, negocio_admin.id_negocio ASC
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
