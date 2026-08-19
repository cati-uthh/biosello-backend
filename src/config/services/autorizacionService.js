const crearError = (message, statusCode = 403, code = 'FORBIDDEN') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const perfilSesionValido = (sesion) => {
  if (!sesion?.idUsuario || !['admin', 'empleado'].includes(sesion.perfil)) {
    throw crearError('La sesión no tiene permisos para acceder a este recurso.', 403, 'PROFILE_FORBIDDEN');
  }
};

export const validarAccesoNegocio = async (
  connection,
  { idNegocio, sesion, soloAdministrador = false }
) => {
  perfilSesionValido(sesion);

  if (!Number.isInteger(Number(idNegocio)) || Number(idNegocio) <= 0) {
    throw crearError('El negocio indicado no es válido.', 400, 'NEGOCIO_INVALIDO');
  }

  if (soloAdministrador && sesion.perfil !== 'admin') {
    throw crearError(
      'Solo una cuenta administradora puede gestionar sucursales.',
      403,
      'ADMIN_REQUIRED'
    );
  }

  let query;
  let params;

  if (sesion.perfil === 'admin') {
    query = `
      SELECT n.id_negocio, n.id_negocio_padre, n.id_admin
      FROM negocio n
      INNER JOIN usuario u
        ON u.id_usuario = n.id_admin
       AND u.id_usuario = ?
       AND u.activo = 1
       AND LOWER(u.perfil) IN ('admin', 'administrador')
      WHERE n.id_negocio = ?
      LIMIT 1
    `;
    params = [sesion.idUsuario, Number(idNegocio)];
  } else {
    if (soloAdministrador) {
      throw crearError(
        'Solo una cuenta administradora puede gestionar sucursales.',
        403,
        'ADMIN_REQUIRED'
      );
    }

    query = `
      SELECT n.id_negocio, n.id_negocio_padre, n.id_admin
      FROM negocio n
      INNER JOIN empleado_negocio en
        ON en.id_negocio = n.id_negocio
       AND en.id_usuario = ?
       AND en.activo = 1
      INNER JOIN usuario u
        ON u.id_usuario = en.id_usuario
       AND u.activo = 1
       AND LOWER(u.perfil) = 'empleado'
      WHERE n.id_negocio = ?
      LIMIT 1
    `;
    params = [sesion.idUsuario, Number(idNegocio)];
  }

  const [rows] = await connection.execute(query, params);
  if (rows.length === 0) {
    throw crearError(
      'No tienes autorización para acceder a este negocio.',
      403,
      'NEGOCIO_FORBIDDEN'
    );
  }

  return rows[0];
};

export const validarAccesoLote = async (connection, { idLote, sesion, bloquear = false }) => {
  perfilSesionValido(sesion);

  if (!Number.isInteger(Number(idLote)) || Number(idLote) <= 0) {
    throw crearError('El lote indicado no es válido.', 400, 'LOTE_INVALIDO');
  }

  const [rows] = await connection.execute(
    `
      SELECT l.id_lote, l.id_negocio
      FROM lote l
      WHERE l.id_lote = ?
      LIMIT 1
      ${bloquear ? 'FOR UPDATE' : ''}
    `,
    [Number(idLote)]
  );

  if (rows.length === 0) {
    throw crearError('El lote indicado no existe.', 404, 'LOTE_NOT_FOUND');
  }

  await validarAccesoNegocio(connection, {
    idNegocio: rows[0].id_negocio,
    sesion,
  });

  return rows[0];
};

export const agregarFiltroAccesoLotes = ({ filtros, params, sesion }) => {
  perfilSesionValido(sesion);

  if (sesion.perfil === 'admin') {
    filtros.push(`
      EXISTS (
        SELECT 1
        FROM negocio negocio_autorizado
        INNER JOIN usuario usuario_autorizado
          ON usuario_autorizado.id_usuario = negocio_autorizado.id_admin
         AND usuario_autorizado.activo = 1
         AND LOWER(usuario_autorizado.perfil) IN ('admin', 'administrador')
        WHERE negocio_autorizado.id_negocio = l.id_negocio
          AND negocio_autorizado.id_admin = ?
      )
    `);
  } else {
    filtros.push(`
      EXISTS (
        SELECT 1
        FROM empleado_negocio empleado_autorizado
        INNER JOIN usuario usuario_autorizado
          ON usuario_autorizado.id_usuario = empleado_autorizado.id_usuario
         AND usuario_autorizado.activo = 1
         AND LOWER(usuario_autorizado.perfil) = 'empleado'
        WHERE empleado_autorizado.id_negocio = l.id_negocio
          AND empleado_autorizado.id_usuario = ?
          AND empleado_autorizado.activo = 1
      )
    `);
  }

  params.push(sesion.idUsuario);
};
