import pool from '../db';

const crearError = (message, statusCode = 400, code = 'VALIDATION_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const ejecutarUpsert = async (connection, query, params) => {
  const [result] = await connection.execute(query, params);
  return result.insertId;
};

const obtenerIdOrigen = async (connection, origen) => ejecutarUpsert(
  connection,
  `
    INSERT INTO origen (upp_origen, localidad_origen, municipio_origen, entidad_federativa)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      localidad_origen = VALUES(localidad_origen),
      municipio_origen = VALUES(municipio_origen),
      entidad_federativa = VALUES(entidad_federativa),
      id_origen = LAST_INSERT_ID(id_origen)
  `,
  [
    origen.upp_origen,
    origen.localidad_origen,
    origen.municipio_origen,
    origen.entidad_federativa,
  ]
);

const obtenerIdPropietario = async (connection, propietario, idOrigen) => ejecutarUpsert(
  connection,
  `
    INSERT INTO propietario (nombre_propietario, curp_propietario, upp_propietario, id_origen)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nombre_propietario = VALUES(nombre_propietario),
      upp_propietario = VALUES(upp_propietario),
      id_origen = VALUES(id_origen),
      id_propietario = LAST_INSERT_ID(id_propietario)
  `,
  [
    propietario.nombre_propietario,
    propietario.curp_propietario,
    propietario.upp_propietario,
    idOrigen,
  ]
);

const obtenerIdRastro = async (connection, rastro) => ejecutarUpsert(
  connection,
  `
    INSERT INTO rastro (num_rastro, nombre_rastro, nombre_destinatario, municipio, entidad_federativa)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nombre_rastro = VALUES(nombre_rastro),
      nombre_destinatario = VALUES(nombre_destinatario),
      municipio = VALUES(municipio),
      entidad_federativa = VALUES(entidad_federativa),
      id_rastro = LAST_INSERT_ID(id_rastro)
  `,
  [
    rastro.num_rastro,
    rastro.nombre_rastro,
    rastro.nombre_destinatario,
    rastro.municipio,
    rastro.entidad_federativa,
  ]
);

const obtenerIdAnimal = async (connection, animal, idOrigen, idPropietario) => ejecutarUpsert(
  connection,
  `
    INSERT INTO animal (
      num_arete,
      especie,
      sexo,
      clasificacion,
      meses_edad,
      arete_faltante,
      id_origen,
      id_propietario
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      especie = VALUES(especie),
      sexo = VALUES(sexo),
      clasificacion = VALUES(clasificacion),
      meses_edad = VALUES(meses_edad),
      arete_faltante = VALUES(arete_faltante),
      id_origen = VALUES(id_origen),
      id_propietario = VALUES(id_propietario),
      id_animal = LAST_INSERT_ID(id_animal)
  `,
  [
    animal.num_arete,
    animal.especie,
    animal.sexo,
    animal.clasificacion,
    animal.meses_edad,
    animal.arete_faltante,
    idOrigen,
    idPropietario,
  ]
);

const obtenerIdGuia = async (connection, guia, idPropietario, idRastro) => ejecutarUpsert(
  connection,
  `
    INSERT INTO guia_transito (
      folio_guia,
      num_reemo,
      motivo_movilizacion,
      fecha_expedicion,
      vigencia_dias,
      centro_expedidor,
      elaboro,
      id_propietario,
      id_rastro
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      num_reemo = VALUES(num_reemo),
      motivo_movilizacion = VALUES(motivo_movilizacion),
      fecha_expedicion = VALUES(fecha_expedicion),
      vigencia_dias = VALUES(vigencia_dias),
      centro_expedidor = VALUES(centro_expedidor),
      elaboro = VALUES(elaboro),
      id_propietario = VALUES(id_propietario),
      id_rastro = VALUES(id_rastro),
      id_guia = LAST_INSERT_ID(id_guia)
  `,
  [
    guia.folio_guia,
    guia.num_reemo,
    guia.motivo_movilizacion,
    guia.fecha_expedicion,
    guia.vigencia_dias,
    guia.centro_expedidor,
    guia.elaboro,
    idPropietario,
    idRastro,
  ]
);

const validarRelacionNegocio = async (connection, idNegocio) => {
  if (!idNegocio) return null;

  const [rows] = await connection.execute(
    'SELECT id_negocio FROM negocio WHERE id_negocio = ? LIMIT 1',
    [idNegocio]
  );

  if (rows.length === 0) {
    throw crearError('El negocio indicado no existe.', 400, 'NEGOCIO_NOT_FOUND');
  }

  return idNegocio;
};

const validarRelacionEmpleado = async (connection, idEmpleado) => {
  if (!idEmpleado) return null;

  const [rows] = await connection.execute(
    'SELECT id_usuario FROM usuario WHERE id_usuario = ? LIMIT 1',
    [idEmpleado]
  );

  if (rows.length === 0) {
    throw crearError('El empleado indicado no existe.', 400, 'EMPLEADO_NOT_FOUND');
  }

  return idEmpleado;
};

const insertarLote = async (connection, lote, idAnimal) => {
  const [existente] = await connection.execute(
    'SELECT id_lote FROM lote WHERE codigo_lote = ? LIMIT 1',
    [lote.codigo_lote]
  );

  if (existente.length > 0) {
    throw crearError('El codigo de lote ya se encuentra registrado.', 409, 'LOTE_DUPLICADO');
  }

  const idNegocio = await validarRelacionNegocio(connection, lote.id_negocio);
  const idEmpleado = await validarRelacionEmpleado(connection, lote.id_empleado);

  const [result] = await connection.execute(
    `
      INSERT INTO lote (
        codigo_lote,
        tipo_corte,
        peso_kg,
        fecha_ingreso,
        fecha_vencimiento,
        estado,
        id_animal,
        id_negocio,
        id_empleado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      lote.codigo_lote,
      lote.tipo_corte,
      lote.peso_kg,
      lote.fecha_ingreso,
      lote.fecha_vencimiento,
      lote.estado,
      idAnimal,
      idNegocio,
      idEmpleado,
    ]
  );

  return result.insertId;
};

export const registrarLoteAnimal = async (datos) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const idOrigen = await obtenerIdOrigen(connection, datos.origen);
    const idPropietario = await obtenerIdPropietario(connection, datos.propietario, idOrigen);
    const idRastro = await obtenerIdRastro(connection, datos.rastro);
    const idAnimal = await obtenerIdAnimal(connection, datos.animal, idOrigen, idPropietario);
    const idGuia = await obtenerIdGuia(connection, datos.guia_transito, idPropietario, idRastro);
    const idLote = await insertarLote(connection, datos.lote, idAnimal);

    await connection.execute(
      `
        INSERT IGNORE INTO guia_animal (id_guia, id_animal)
        VALUES (?, ?)
      `,
      [idGuia, idAnimal]
    );

    await connection.commit();

    return {
      id_lote: idLote,
      codigo_lote: datos.lote.codigo_lote,
      id_animal: idAnimal,
      num_arete: datos.animal.num_arete,
      id_guia: idGuia,
      folio_guia: datos.guia_transito.folio_guia,
      id_origen: idOrigen,
      id_propietario: idPropietario,
      id_rastro: idRastro,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const obtenerLotes = async ({
  idNegocio = null,
  idEmpleado = null,
  especie = null,
  estado = null,
  fechaIngreso = null,
} = {}) => {
  const connection = await pool.getConnection();

  try {
    const filtros = [];
    const params = [];

    if (idNegocio) {
      filtros.push('l.id_negocio = ?');
      params.push(idNegocio);
    }

    if (!idNegocio && idEmpleado) {
      filtros.push('l.id_empleado = ?');
      params.push(idEmpleado);
    }

    if (especie) {
      filtros.push('a.especie = ?');
      params.push(especie);
    }

    if (estado) {
      filtros.push('l.estado = ?');
      params.push(estado);
    }

    if (fechaIngreso) {
      filtros.push('l.fecha_ingreso = ?');
      params.push(fechaIngreso);
    }

    const where = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

    const [rows] = await connection.execute(
      `
        SELECT
          l.id_lote,
          l.codigo_lote,
          l.tipo_corte,
          l.peso_kg,
          DATE_FORMAT(l.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
          DATE_FORMAT(l.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
          l.estado,
          l.id_negocio,
          l.id_empleado,
          a.id_animal,
          a.num_arete,
          a.especie,
          a.sexo,
          a.clasificacion,
          a.meses_edad,
          a.arete_faltante,
          CASE
            WHEN a.especie = 'BOVINO' THEN 'Res'
            WHEN a.especie = 'PORCINO' THEN 'Cerdo'
            ELSE a.especie
          END AS especie_nombre,
          (
            SELECT gt.folio_guia
            FROM guia_animal ga
            INNER JOIN guia_transito gt ON gt.id_guia = ga.id_guia
            WHERE ga.id_animal = a.id_animal
            ORDER BY gt.created_at DESC, gt.id_guia DESC
            LIMIT 1
          ) AS folio_guia
        FROM lote l
        LEFT JOIN animal a ON a.id_animal = l.id_animal
        ${where}
        ORDER BY l.fecha_ingreso DESC, l.id_lote DESC
      `,
      params
    );

    return rows;
  } finally {
    connection.release();
  }
};


const obtenerLotePorId = async (connection, idLote) => {
  const [rows] = await connection.execute(
    `
      SELECT
        l.id_lote,
        l.codigo_lote,
        l.tipo_corte,
        l.peso_kg,
        DATE_FORMAT(l.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
        DATE_FORMAT(l.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
        l.estado,
        l.id_negocio,
        l.id_empleado,
        a.id_animal,
        a.num_arete,
        a.especie,
        a.sexo,
        a.clasificacion,
        a.meses_edad,
        a.arete_faltante,
        CASE
          WHEN a.especie = 'BOVINO' THEN 'Res'
          WHEN a.especie = 'PORCINO' THEN 'Cerdo'
          ELSE a.especie
        END AS especie_nombre,
        (
          SELECT gt.folio_guia
          FROM guia_animal ga
          INNER JOIN guia_transito gt ON gt.id_guia = ga.id_guia
          WHERE ga.id_animal = a.id_animal
          ORDER BY gt.created_at DESC, gt.id_guia DESC
          LIMIT 1
        ) AS folio_guia
      FROM lote l
      LEFT JOIN animal a ON a.id_animal = l.id_animal
      WHERE l.id_lote = ?
      LIMIT 1
    `,
    [idLote]
  );

  return rows[0] || null;
};

export const cambiarEstadoLote = async ({ idLote, estado, idUsuario = null }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [lotes] = await connection.execute(
      `
        SELECT id_lote, estado
        FROM lote
        WHERE id_lote = ?
        LIMIT 1
      `,
      [idLote]
    );

    if (lotes.length === 0) {
      throw crearError('El lote indicado no existe.', 404, 'LOTE_NOT_FOUND');
    }

    const estadoAnterior = lotes[0].estado;

    if (estadoAnterior === estado) {
      await connection.commit();
      return {
        id_lote: idLote,
        estado_anterior: estadoAnterior,
        estado_nuevo: estado,
      };
    }

    await connection.execute(
      'UPDATE lote SET estado = ? WHERE id_lote = ?',
      [estado, idLote]
    );

    await connection.execute(
      `
        INSERT INTO historial_estado (id_lote, estado_anterior, estado_nuevo, cambiado_por)
        VALUES (?, ?, ?, ?)
      `,
      [idLote, estadoAnterior, estado, idUsuario]
    );

    await connection.commit();

    return {
      id_lote: idLote,
      estado_anterior: estadoAnterior,
      estado_nuevo: estado,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};


export const actualizarLoteAnimal = async ({ idLote, lote, animal, idUsuario = null }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [actualRows] = await connection.execute(
      'SELECT id_lote, codigo_lote, estado, id_animal FROM lote WHERE id_lote = ? LIMIT 1 FOR UPDATE',
      [idLote]
    );

    if (actualRows.length === 0) {
      throw crearError('El lote indicado no existe.', 404, 'LOTE_NOT_FOUND');
    }

    const actual = actualRows[0];

    const [loteDuplicado] = await connection.execute(
      'SELECT id_lote FROM lote WHERE codigo_lote = ? AND id_lote <> ? LIMIT 1',
      [lote.codigo_lote, idLote]
    );

    if (loteDuplicado.length > 0) {
      throw crearError('El codigo de lote ya se encuentra registrado.', 409, 'LOTE_DUPLICADO');
    }

    await connection.execute(
      `
        UPDATE lote
        SET codigo_lote = ?,
            tipo_corte = ?,
            peso_kg = ?,
            fecha_ingreso = ?,
            fecha_vencimiento = ?,
            estado = ?
        WHERE id_lote = ?
      `,
      [
        lote.codigo_lote,
        lote.tipo_corte,
        lote.peso_kg,
        lote.fecha_ingreso,
        lote.fecha_vencimiento,
        lote.estado,
        idLote,
      ]
    );

    if (actual.id_animal && animal) {
      const [animalDuplicado] = await connection.execute(
        'SELECT id_animal FROM animal WHERE num_arete = ? AND id_animal <> ? LIMIT 1',
        [animal.num_arete, actual.id_animal]
      );

      if (animalDuplicado.length > 0) {
        throw crearError('El numero de arete ya se encuentra registrado.', 409, 'ANIMAL_DUPLICADO');
      }

      await connection.execute(
        `
          UPDATE animal
          SET num_arete = ?,
              sexo = ?,
              clasificacion = ?,
              meses_edad = ?,
              arete_faltante = ?
          WHERE id_animal = ?
        `,
        [
          animal.num_arete,
          animal.sexo,
          animal.clasificacion,
          animal.meses_edad,
          animal.arete_faltante,
          actual.id_animal,
        ]
      );
    }

    if (actual.estado !== lote.estado) {
      await connection.execute(
        `
          INSERT INTO historial_estado (id_lote, estado_anterior, estado_nuevo, cambiado_por)
          VALUES (?, ?, ?, ?)
        `,
        [idLote, actual.estado, lote.estado, idUsuario]
      );
    }

    const actualizado = await obtenerLotePorId(connection, idLote);
    await connection.commit();

    return actualizado;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const eliminarLote = async ({ idLote }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existente] = await connection.execute(
      'SELECT id_lote FROM lote WHERE id_lote = ? LIMIT 1',
      [idLote]
    );

    if (existente.length === 0) {
      throw crearError('El lote indicado no existe.', 404, 'LOTE_NOT_FOUND');
    }

    await connection.execute('DELETE FROM lote WHERE id_lote = ?', [idLote]);
    await connection.commit();

    return { id_lote: idLote };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
