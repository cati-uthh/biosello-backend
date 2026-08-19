import bcrypt from 'bcryptjs';
import pool from '../db.js';

const crearError = (message, statusCode = 400, code = 'REQUEST_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const validarAdministrador = async (connection, idNegocio, idAdmin) => {
  const [rows] = await connection.execute(
    `
      SELECT n.id_negocio
      FROM negocio n
      INNER JOIN usuario administrador
        ON administrador.id_usuario = n.id_admin
       AND administrador.activo = 1
       AND LOWER(administrador.perfil) IN ('admin', 'administrador')
      WHERE n.id_negocio = ? AND n.id_admin = ?
      LIMIT 1
    `,
    [idNegocio, idAdmin]
  );

  if (rows.length === 0) {
    throw crearError(
      'No tienes autorización para administrar empleados de este negocio.',
      403,
      'EMPLEADOS_FORBIDDEN'
    );
  }
};

const validarEmpleadoAsignado = async (connection, idEmpleado, idNegocio) => {
  const [rows] = await connection.execute(
    `
      SELECT en.id_usuario
      FROM empleado_negocio en
      INNER JOIN usuario u ON u.id_usuario = en.id_usuario
      WHERE en.id_usuario = ?
        AND en.id_negocio = ?
        AND en.activo = 1
        AND u.activo = 1
        AND u.perfil = 'empleado'
      LIMIT 1
    `,
    [idEmpleado, idNegocio]
  );

  if (rows.length === 0) {
    throw crearError('El empleado indicado no pertenece a este negocio.', 404, 'EMPLEADO_NOT_FOUND');
  }
};

const validarDuplicados = async (connection, email, telefono, idExcluir = null) => {
  let query = `
    SELECT id_usuario, email, telefono
    FROM usuario
    WHERE (email = ? OR telefono = ?)
  `;
  const parametros = [email, telefono];

  if (idExcluir) {
    query += ' AND id_usuario <> ?';
    parametros.push(idExcluir);
  }

  query += ' LIMIT 1';
  const [rows] = await connection.execute(query, parametros);
  if (rows.length === 0) return;

  if (String(rows[0].email).toLowerCase() === email.toLowerCase()) {
    throw crearError('Ese correo electrónico ya está registrado.', 409, 'EMAIL_DUPLICADO');
  }
  throw crearError('Ese número de teléfono ya está registrado.', 409, 'TELEFONO_DUPLICADO');
};

const obtenerEmpleado = async (connection, idEmpleado, idNegocio) => {
  const [rows] = await connection.execute(
    `
      SELECT
        u.id_usuario,
        u.nombre,
        u.email,
        u.telefono,
        u.perfil,
        u.activo,
        en.id_negocio,
        en.puesto
      FROM empleado_negocio en
      INNER JOIN usuario u ON u.id_usuario = en.id_usuario
      WHERE en.id_usuario = ? AND en.id_negocio = ?
      LIMIT 1
    `,
    [idEmpleado, idNegocio]
  );

  if (rows.length === 0) {
    throw crearError('El empleado indicado no existe.', 404, 'EMPLEADO_NOT_FOUND');
  }

  return rows[0];
};

export const obtenerEmpleadosDelNegocio = async ({ idNegocio, idAdmin }) => {
  const connection = await pool.getConnection();
  try {
    await validarAdministrador(connection, idNegocio, idAdmin);
    const [rows] = await connection.execute(
      `
        SELECT
          u.id_usuario,
          u.nombre,
          u.email,
          u.telefono,
          u.perfil,
          u.activo,
          en.id_negocio,
          en.puesto
        FROM empleado_negocio en
        INNER JOIN usuario u ON u.id_usuario = en.id_usuario
        WHERE en.id_negocio = ?
          AND en.activo = 1
          AND u.activo = 1
          AND u.perfil = 'empleado'
        ORDER BY u.nombre ASC, u.id_usuario ASC
      `,
      [idNegocio]
    );
    return rows;
  } finally {
    connection.release();
  }
};

export const crearEmpleadoDelNegocio = async ({
  idNegocio,
  idAdmin,
  nombre,
  email,
  telefono,
  puesto,
  contrasena,
}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await validarAdministrador(connection, idNegocio, idAdmin);
    await validarDuplicados(connection, email, telefono);

    const contrasenaHash = await bcrypt.hash(contrasena, 10);
    const [resultadoUsuario] = await connection.execute(
      `
        INSERT INTO usuario (nombre, email, telefono, contrasena_hash, perfil, activo)
        VALUES (?, ?, ?, ?, 'empleado', 1)
      `,
      [nombre, email, telefono, contrasenaHash]
    );

    const idEmpleado = resultadoUsuario.insertId;
    await connection.execute(
      `
        INSERT INTO empleado_negocio (id_usuario, id_negocio, puesto, activo)
        VALUES (?, ?, ?, 1)
      `,
      [idEmpleado, idNegocio, puesto]
    );

    const empleado = await obtenerEmpleado(connection, idEmpleado, idNegocio);
    await connection.commit();
    return empleado;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const actualizarEmpleadoDelNegocio = async ({
  idEmpleado,
  idNegocio,
  idAdmin,
  nombre,
  email,
  telefono,
  puesto,
  contrasena,
}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await validarAdministrador(connection, idNegocio, idAdmin);
    await validarEmpleadoAsignado(connection, idEmpleado, idNegocio);
    await validarDuplicados(connection, email, telefono, idEmpleado);

    if (contrasena) {
      const contrasenaHash = await bcrypt.hash(contrasena, 10);
      await connection.execute(
        `
          UPDATE usuario
          SET nombre = ?, email = ?, telefono = ?, contrasena_hash = ?, activo = 1
          WHERE id_usuario = ? AND perfil = 'empleado'
        `,
        [nombre, email, telefono, contrasenaHash, idEmpleado]
      );
    } else {
      await connection.execute(
        `
          UPDATE usuario
          SET nombre = ?, email = ?, telefono = ?, activo = 1
          WHERE id_usuario = ? AND perfil = 'empleado'
        `,
        [nombre, email, telefono, idEmpleado]
      );
    }

    await connection.execute(
      `
        UPDATE empleado_negocio
        SET puesto = ?, activo = 1
        WHERE id_usuario = ? AND id_negocio = ?
      `,
      [puesto, idEmpleado, idNegocio]
    );

    const empleado = await obtenerEmpleado(connection, idEmpleado, idNegocio);
    await connection.commit();
    return empleado;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const desactivarEmpleadoDelNegocio = async ({ idEmpleado, idNegocio, idAdmin }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await validarAdministrador(connection, idNegocio, idAdmin);
    await validarEmpleadoAsignado(connection, idEmpleado, idNegocio);

    await connection.execute(
      'UPDATE empleado_negocio SET activo = 0 WHERE id_usuario = ? AND id_negocio = ?',
      [idEmpleado, idNegocio]
    );
    await connection.execute(
      "UPDATE usuario SET activo = 0 WHERE id_usuario = ? AND perfil = 'empleado'",
      [idEmpleado]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
