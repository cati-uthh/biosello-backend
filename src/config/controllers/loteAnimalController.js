import { actualizarLoteAnimal, cambiarEstadoLote, eliminarLote, obtenerLotes, registrarLoteAnimal } from '../services/loteAnimalService.js';
import { handleError } from '../utils/errorHandler.js';

const ESPECIES = ['BOVINO', 'PORCINO', 'OVINO', 'CAPRINO', 'EQUINO'];
const SEXOS = ['MACHO', 'HEMBRA'];
const CLASIFICACIONES = ['VAQUILLA', 'VACA', 'TORETE', 'TORO', 'BECERRO', 'BECERRA', 'BUEY'];
const MOTIVOS = ['SACRIFICIO', 'ENGORDA', 'REPRODUCCION', 'EXPOSICION', 'VENTA'];
const ESTADOS_LOTE = ['activo', 'procesado', 'vendido', 'caducado'];

const texto = (valor) => String(valor ?? '').trim();
const fechaValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(texto(valor));
const numeroPositivo = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0;
};

const validarEnum = (lista, valor, campo, errores) => {
  if (!lista.includes(valor)) {
    errores.push(`${campo} no es valido.`);
  }
};

const validarRequerido = (objeto, campo, mensaje, errores) => {
  if (!texto(objeto?.[campo])) {
    errores.push(mensaje);
  }
};

const validarDatos = (datos) => {
  const errores = [];
  const guia = datos.guia_transito || {};
  const origen = datos.origen || {};
  const propietario = datos.propietario || {};
  const rastro = datos.rastro || {};
  const animal = datos.animal || {};
  const lote = datos.lote || {};

  validarRequerido(guia, 'folio_guia', 'El folio de guia es obligatorio.', errores);
  validarRequerido(guia, 'fecha_expedicion', 'La fecha de expedicion es obligatoria.', errores);
  validarRequerido(guia, 'centro_expedidor', 'El centro expedidor es obligatorio.', errores);
  validarEnum(MOTIVOS, guia.motivo_movilizacion, 'motivo_movilizacion', errores);

  if (guia.fecha_expedicion && !fechaValida(guia.fecha_expedicion)) {
    errores.push('La fecha de expedicion debe usar formato AAAA-MM-DD.');
  }
  if (!numeroPositivo(guia.vigencia_dias)) {
    errores.push('La vigencia de la guia debe ser mayor a 0.');
  }

  validarRequerido(origen, 'upp_origen', 'La UPP de origen es obligatoria.', errores);
  validarRequerido(origen, 'localidad_origen', 'La localidad de origen es obligatoria.', errores);
  validarRequerido(origen, 'municipio_origen', 'El municipio de origen es obligatorio.', errores);
  validarRequerido(origen, 'entidad_federativa', 'La entidad federativa de origen es obligatoria.', errores);

  validarRequerido(propietario, 'nombre_propietario', 'El nombre del propietario es obligatorio.', errores);
  validarRequerido(propietario, 'curp_propietario', 'La CURP del propietario es obligatoria.', errores);
  validarRequerido(propietario, 'upp_propietario', 'La UPP del propietario es obligatoria.', errores);
  if (propietario.curp_propietario && texto(propietario.curp_propietario).length !== 18) {
    errores.push('La CURP del propietario debe tener 18 caracteres.');
  }

  validarRequerido(rastro, 'num_rastro', 'El numero de rastro es obligatorio.', errores);
  validarRequerido(rastro, 'nombre_rastro', 'El nombre del rastro es obligatorio.', errores);
  validarRequerido(rastro, 'nombre_destinatario', 'El destinatario del rastro es obligatorio.', errores);
  validarRequerido(rastro, 'municipio', 'El municipio del rastro es obligatorio.', errores);
  validarRequerido(rastro, 'entidad_federativa', 'La entidad federativa del rastro es obligatoria.', errores);

  validarRequerido(animal, 'num_arete', 'El numero de arete es obligatorio.', errores);
  validarEnum(ESPECIES, animal.especie, 'especie', errores);
  validarEnum(SEXOS, animal.sexo, 'sexo', errores);
  validarEnum(CLASIFICACIONES, animal.clasificacion, 'clasificacion', errores);
  if (!Number.isInteger(Number(animal.meses_edad)) || Number(animal.meses_edad) < 0) {
    errores.push('La edad del animal debe ser un numero entero mayor o igual a 0.');
  }

  validarRequerido(lote, 'codigo_lote', 'El codigo de lote es obligatorio.', errores);
  validarRequerido(lote, 'tipo_corte', 'El tipo de corte es obligatorio.', errores);
  validarEnum(ESTADOS_LOTE, lote.estado, 'estado', errores);
  if (!numeroPositivo(lote.peso_kg)) {
    errores.push('El peso del lote debe ser mayor a 0.');
  }
  if (!fechaValida(lote.fecha_ingreso)) {
    errores.push('La fecha de ingreso debe usar formato AAAA-MM-DD.');
  }
  if (!fechaValida(lote.fecha_vencimiento)) {
    errores.push('La fecha de vencimiento debe usar formato AAAA-MM-DD.');
  }
  if (
    fechaValida(lote.fecha_ingreso) &&
    fechaValida(lote.fecha_vencimiento) &&
    new Date(lote.fecha_vencimiento) < new Date(lote.fecha_ingreso)
  ) {
    errores.push('La fecha de vencimiento no puede ser anterior a la fecha de ingreso.');
  }

  return errores;
};

const normalizarDatos = (datos) => ({
  guia_transito: {
    folio_guia: texto(datos.guia_transito.folio_guia),
    num_reemo: texto(datos.guia_transito.num_reemo) || null,
    motivo_movilizacion: datos.guia_transito.motivo_movilizacion,
    fecha_expedicion: texto(datos.guia_transito.fecha_expedicion),
    vigencia_dias: Number(datos.guia_transito.vigencia_dias),
    centro_expedidor: texto(datos.guia_transito.centro_expedidor),
    elaboro: texto(datos.guia_transito.elaboro) || null,
  },
  origen: {
    upp_origen: texto(datos.origen.upp_origen),
    localidad_origen: texto(datos.origen.localidad_origen),
    municipio_origen: texto(datos.origen.municipio_origen),
    entidad_federativa: texto(datos.origen.entidad_federativa),
  },
  propietario: {
    nombre_propietario: texto(datos.propietario.nombre_propietario),
    curp_propietario: texto(datos.propietario.curp_propietario).toUpperCase(),
    upp_propietario: texto(datos.propietario.upp_propietario),
  },
  rastro: {
    num_rastro: texto(datos.rastro.num_rastro),
    nombre_rastro: texto(datos.rastro.nombre_rastro),
    nombre_destinatario: texto(datos.rastro.nombre_destinatario),
    municipio: texto(datos.rastro.municipio),
    entidad_federativa: texto(datos.rastro.entidad_federativa),
  },
  animal: {
    num_arete: texto(datos.animal.num_arete),
    especie: datos.animal.especie,
    sexo: datos.animal.sexo,
    clasificacion: datos.animal.clasificacion,
    meses_edad: Number(datos.animal.meses_edad),
    arete_faltante: datos.animal.arete_faltante ? 1 : 0,
  },
  lote: {
    codigo_lote: texto(datos.lote.codigo_lote),
    tipo_corte: texto(datos.lote.tipo_corte),
    peso_kg: Number(datos.lote.peso_kg),
    fecha_ingreso: texto(datos.lote.fecha_ingreso),
    fecha_vencimiento: texto(datos.lote.fecha_vencimiento),
    estado: datos.lote.estado,
    id_negocio: datos.lote.id_negocio || null,
    id_empleado: datos.lote.id_empleado || null,
  },
});


const validarActualizacionLoteAnimal = (datos) => {
  const errores = [];
  const lote = datos.lote || {};
  const animal = datos.animal || {};

  validarRequerido(lote, 'codigo_lote', 'El codigo de lote es obligatorio.', errores);
  validarRequerido(lote, 'tipo_corte', 'El tipo de corte es obligatorio.', errores);
  validarEnum(ESTADOS_LOTE, lote.estado, 'estado', errores);

  if (!numeroPositivo(lote.peso_kg)) {
    errores.push('El peso del lote debe ser mayor a 0.');
  }
  if (!fechaValida(lote.fecha_ingreso)) {
    errores.push('La fecha de ingreso debe usar formato AAAA-MM-DD.');
  }
  if (!fechaValida(lote.fecha_vencimiento)) {
    errores.push('La fecha de vencimiento debe usar formato AAAA-MM-DD.');
  }
  if (
    fechaValida(lote.fecha_ingreso) &&
    fechaValida(lote.fecha_vencimiento) &&
    new Date(lote.fecha_vencimiento) < new Date(lote.fecha_ingreso)
  ) {
    errores.push('La fecha de vencimiento no puede ser anterior a la fecha de ingreso.');
  }

  validarRequerido(animal, 'num_arete', 'El numero de arete es obligatorio.', errores);
  validarEnum(SEXOS, animal.sexo, 'sexo', errores);
  validarEnum(CLASIFICACIONES, animal.clasificacion, 'clasificacion', errores);
  if (!Number.isInteger(Number(animal.meses_edad)) || Number(animal.meses_edad) < 0) {
    errores.push('La edad del animal debe ser un numero entero mayor o igual a 0.');
  }

  return errores;
};

const normalizarActualizacionLoteAnimal = (datos) => {
  const lote = datos.lote || {};
  const animal = datos.animal || {};

  return {
    lote: {
      codigo_lote: texto(lote.codigo_lote),
      tipo_corte: texto(lote.tipo_corte),
      peso_kg: Number(lote.peso_kg),
      fecha_ingreso: texto(lote.fecha_ingreso),
      fecha_vencimiento: texto(lote.fecha_vencimiento),
      estado: texto(lote.estado).toLowerCase(),
    },
    animal: {
      num_arete: texto(animal.num_arete),
      sexo: texto(animal.sexo).toUpperCase(),
      clasificacion: texto(animal.clasificacion).toUpperCase(),
      meses_edad: Number(animal.meses_edad),
      arete_faltante: animal.arete_faltante ? 1 : 0,
    },
  };
};

export const registrarNuevoLoteAnimal = async (req, res) => {
  try {
    const errores = validarDatos(req.body || {});

    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos invalidos para registrar lote/animal.',
        details: errores,
      });
    }

    const resultado = await registrarLoteAnimal(normalizarDatos(req.body));

    return res.status(201).json({
      success: true,
      message: 'Lote, animal y guia registrados correctamente.',
      data: resultado,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message || 'La solicitud no pudo procesarse.',
        code: error.code || 'REQUEST_ERROR',
      });
    }

    return handleError(res, error);
  }
};


export const consultarLotes = async (req, res) => {
  try {
    const idNegocio = req.query?.id_negocio ? Number(req.query.id_negocio) : null;
    const idEmpleado = req.query?.id_empleado ? Number(req.query.id_empleado) : null;
    const especie = texto(req.query?.especie).toUpperCase();
    const estado = texto(req.query?.estado).toLowerCase();
    const fechaIngreso = texto(req.query?.fecha_ingreso);

    if (req.query?.id_negocio && !Number.isInteger(idNegocio)) {
      return res.status(400).json({ success: false, error: 'id_negocio no es valido.' });
    }

    if (req.query?.id_empleado && !Number.isInteger(idEmpleado)) {
      return res.status(400).json({ success: false, error: 'id_empleado no es valido.' });
    }

    if (especie && !ESPECIES.includes(especie)) {
      return res.status(400).json({ success: false, error: 'especie no es valida.' });
    }

    if (estado && !ESTADOS_LOTE.includes(estado)) {
      return res.status(400).json({ success: false, error: 'estado no es valido.' });
    }

    if (fechaIngreso && !fechaValida(fechaIngreso)) {
      return res.status(400).json({ success: false, error: 'fecha_ingreso debe usar formato AAAA-MM-DD.' });
    }

    const lotes = await obtenerLotes({
      idNegocio,
      idEmpleado,
      especie: especie || null,
      estado: estado || null,
      fechaIngreso: fechaIngreso || null,
    });

    return res.status(200).json({
      success: true,
      data: lotes,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const actualizarEstadoLote = async (req, res) => {
  try {
    const idLote = Number(req.body?.id_lote);
    const estado = texto(req.body?.estado).toLowerCase();
    const idUsuario = req.body?.id_usuario ? Number(req.body.id_usuario) : null;

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({
        success: false,
        error: 'id_lote no es valido.',
      });
    }

    if (!ESTADOS_LOTE.includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'estado no es valido.',
      });
    }

    if (req.body?.id_usuario && (!Number.isInteger(idUsuario) || idUsuario <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'id_usuario no es valido.',
      });
    }

    const resultado = await cambiarEstadoLote({ idLote, estado, idUsuario });

    return res.status(200).json({
      success: true,
      message: 'Estado del lote actualizado correctamente.',
      data: resultado,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message || 'La solicitud no pudo procesarse.',
        code: error.code || 'REQUEST_ERROR',
      });
    }

    return handleError(res, error);
  }
};


export const editarLoteAnimal = async (req, res) => {
  try {
    const idLote = Number(req.body?.id_lote);
    const idUsuario = req.body?.id_usuario ? Number(req.body.id_usuario) : null;

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({ success: false, error: 'id_lote no es valido.' });
    }

    if (req.body?.id_usuario && (!Number.isInteger(idUsuario) || idUsuario <= 0)) {
      return res.status(400).json({ success: false, error: 'id_usuario no es valido.' });
    }

    const datosNormalizados = normalizarActualizacionLoteAnimal(req.body || {});
    const errores = validarActualizacionLoteAnimal(datosNormalizados);

    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos invalidos para actualizar lote/animal.',
        details: errores,
      });
    }

    const resultado = await actualizarLoteAnimal({
      idLote,
      idUsuario,
      lote: datosNormalizados.lote,
      animal: datosNormalizados.animal,
    });

    return res.status(200).json({
      success: true,
      message: 'Lote actualizado correctamente.',
      data: resultado,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message || 'La solicitud no pudo procesarse.',
        code: error.code || 'REQUEST_ERROR',
      });
    }

    return handleError(res, error);
  }
};

export const eliminarLoteAnimal = async (req, res) => {
  try {
    const idLote = Number(req.query?.id_lote || req.body?.id_lote);

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({ success: false, error: 'id_lote no es valido.' });
    }

    const resultado = await eliminarLote({ idLote });

    return res.status(200).json({
      success: true,
      message: 'Lote eliminado correctamente.',
      data: resultado,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message || 'La solicitud no pudo procesarse.',
        code: error.code || 'REQUEST_ERROR',
      });
    }

    return handleError(res, error);
  }
};
