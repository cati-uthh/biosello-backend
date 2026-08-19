import { actualizarLoteAnimal, cambiarEstadoLote, eliminarLote, obtenerLotes, registrarLoteAnimal, registrarSalidaLote } from '../services/loteAnimalService.js';
import { obtenerSesionRequest } from '../utils/auth.js';
import { handleError } from '../utils/errorHandler.js';

const ESPECIES = ['BOVINO', 'PORCINO', 'OVINO', 'CAPRINO', 'EQUINO'];
const SEXOS = ['MACHO', 'HEMBRA'];
const CLASIFICACIONES = ['VAQUILLA', 'VACA', 'TORETE', 'TORO', 'BECERRO', 'BECERRA', 'BUEY', 'LECHON', 'CERDO_ENGORDA', 'MARRANA', 'SEMENTAL'];
const MOTIVOS = ['SACRIFICIO', 'ENGORDA', 'REPRODUCCION', 'EXPOSICION', 'VENTA'];
const ESTADOS_LOTE = ['activo', 'procesado', 'vendido', 'caducado'];

const texto = (valor) => String(valor ?? '').trim();
const fechaValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(texto(valor));
const numeroPositivo = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0;
};

const validarEnum = (lista, valor, campo, errores) => {
  if (valor && !lista.includes(valor)) {
    errores.push(`${campo} no es valido.`);
  }
};

const validarRequerido = (objeto, campo, mensaje, errores) => {
  if (!texto(objeto?.[campo])) {
    errores.push(mensaje);
  }
};

const validarImagenAnimal = (animal, idUsuario, errores) => {
  const imagenUrl = texto(animal?.imagen_animal_url);
  const imagenPathname = texto(animal?.imagen_animal_pathname).replace(/^\/+/, '');

  if (!imagenUrl && !imagenPathname) return;
  if (!imagenUrl || !imagenPathname) {
    errores.push('La URL y la ruta de la fotografia deben enviarse juntas.');
    return;
  }
  if (imagenUrl.length > 2048 || imagenPathname.length > 1024) {
    errores.push('La referencia de la fotografia es demasiado larga.');
    return;
  }
  const prefijosPermitidos = [
    `imagenes/animales/${idUsuario}/`,
    `animales/${idUsuario}/`,
  ];
  if (!prefijosPermitidos.some((prefijo) => imagenPathname.startsWith(prefijo))) {
    errores.push('La fotografia no pertenece a la sesion actual.');
    return;
  }

  try {
    const url = new URL(imagenUrl);
    const pathnameUrl = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (
      url.protocol !== 'https:'
      || !url.hostname.endsWith('.public.blob.vercel-storage.com')
      || pathnameUrl !== imagenPathname
    ) {
      errores.push('La fotografia no corresponde al almacenamiento publico configurado.');
    }
  } catch (error) {
    errores.push('La URL de la fotografia no es valida.');
  }
};

// Validación ajustada: solo exige lo indispensable para la base de datos y la RA
const validarDatos = (datos, idUsuario) => {
  const errores = [];
  const guia = datos.guia_transito || {};
  const origen = datos.origen || {};
  const propietario = datos.propietario || {};
  const animal = datos.animal || {};
  const lote = datos.lote || {};

  validarRequerido(guia, 'folio_guia', 'El folio de guia es obligatorio.', errores);
  validarRequerido(origen, 'localidad_origen', 'La localidad de origen es obligatoria.', errores);
  validarRequerido(propietario, 'nombre_propietario', 'El nombre del propietario es obligatorio.', errores);
  validarRequerido(animal, 'num_arete', 'El numero de arete/sello es obligatorio.', errores);
  validarEnum(ESPECIES, animal.especie, 'especie', errores);
  validarEnum(SEXOS, animal.sexo, 'sexo', errores);
  validarEnum(CLASIFICACIONES, animal.clasificacion, 'clasificacion', errores);
  validarImagenAnimal(animal, idUsuario, errores);

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

  return errores;
};

const validarEdicion = (lote, animal) => {
  const errores = [];
  const codigoLote = texto(lote?.codigo_lote);
  const tipoCorte = texto(lote?.tipo_corte);
  const peso = Number(lote?.peso_kg);
  const fechaIngreso = texto(lote?.fecha_ingreso);
  const fechaVencimiento = texto(lote?.fecha_vencimiento);
  const estado = texto(lote?.estado).toLowerCase();

  if (!codigoLote || codigoLote.length > 100) {
    errores.push('El codigo de lote es obligatorio y no debe exceder 100 caracteres.');
  }
  if (!tipoCorte || tipoCorte.length > 150) {
    errores.push('El tipo de corte es obligatorio y no debe exceder 150 caracteres.');
  }
  if (!Number.isFinite(peso) || peso <= 0) {
    errores.push('El peso total debe ser mayor a 0.');
  }
  if (!fechaValida(fechaIngreso) || !fechaValida(fechaVencimiento)) {
    errores.push('Las fechas deben usar formato AAAA-MM-DD.');
  } else if (fechaVencimiento < fechaIngreso) {
    errores.push('La fecha de vencimiento no puede ser anterior a la fecha de ingreso.');
  }
  if (!ESTADOS_LOTE.includes(estado)) {
    errores.push('El estado del lote no es valido.');
  }

  if (animal) {
    if (!texto(animal.num_arete)) errores.push('El numero de arete/sello es obligatorio.');
    validarEnum(SEXOS, animal.sexo, 'sexo', errores);
    validarEnum(CLASIFICACIONES, animal.clasificacion, 'clasificacion', errores);
    const mesesEdad = Number(animal.meses_edad);
    if (!Number.isInteger(mesesEdad) || mesesEdad < 0 || mesesEdad > 600) {
      errores.push('La edad del animal debe ser un numero entero entre 0 y 600 meses.');
    }
  }

  return errores;
};

// Normalización con valores por defecto seguros para MariaDB/MySQL
const normalizarDatos = (datos) => {
  const timestampUnico = Date.now().toString().slice(-6);

  const guia = datos.guia_transito || {};
  const origen = datos.origen || {};
  const propietario = datos.propietario || {};
  const rastro = datos.rastro || {};
  const animal = datos.animal || {};
  const lote = datos.lote || {};

  return {
    guia_transito: {
      folio_guia: texto(guia.folio_guia),
      num_reemo: texto(guia.num_reemo) || null,
      motivo_movilizacion: 'SACRIFICIO',
      fecha_expedicion: texto(guia.fecha_expedicion) || texto(lote.fecha_ingreso),
      vigencia_dias: Number(guia.vigencia_dias) || 3,
      centro_expedidor: texto(guia.centro_expedidor) || 'AGL LOCAL',
      elaboro: texto(guia.elaboro) || 'SISTEMA',
    },
    origen: {
      upp_origen: texto(origen.upp_origen) || `UPP-${timestampUnico}`,
      localidad_origen: texto(origen.localidad_origen),
      municipio_origen: texto(origen.municipio_origen) || 'Huejutla de Reyes',
      entidad_federativa: texto(origen.entidad_federativa) || 'Hidalgo',
    },
    propietario: {
      nombre_propietario: texto(propietario.nombre_propietario),
      curp_propietario: texto(propietario.curp_propietario).toUpperCase() || `CURP${timestampUnico}XXXXX`,
      upp_propietario: texto(propietario.upp_propietario) || `UPP-${timestampUnico}`,
    },
    rastro: {
      num_rastro: texto(rastro.num_rastro) || `RAS-${timestampUnico}`,
      nombre_rastro: texto(rastro.nombre_rastro) || 'RASTRO MUNICIPAL',
      nombre_destinatario: texto(rastro.nombre_destinatario) || 'CARNICERIA',
      municipio: texto(rastro.municipio) || 'Huejutla de Reyes',
      entidad_federativa: texto(rastro.entidad_federativa) || 'Hidalgo',
    },
    animal: {
      num_arete: texto(animal.num_arete),
      especie: animal.especie || 'BOVINO',
      sexo: animal.sexo || 'HEMBRA',
      clasificacion: animal.clasificacion || 'VAQUILLA',
      meses_edad: Number(animal.meses_edad) || 12,
      arete_faltante: animal.arete_faltante ? 1 : 0,
      imagen_animal_url: texto(animal.imagen_animal_url) || null,
      imagen_animal_pathname: texto(animal.imagen_animal_pathname).replace(/^\/+/, '') || null,
    },
    lote: {
      codigo_lote: texto(lote.codigo_lote) || 'AUTO',
      tipo_corte: texto(lote.tipo_corte),
      peso_kg: Number(lote.peso_kg),
      fecha_ingreso: texto(lote.fecha_ingreso),
      fecha_vencimiento: texto(lote.fecha_vencimiento),
      estado: lote.estado || 'activo',
      tip_recomendacion: null,
      id_negocio: lote.id_negocio || null,
      id_empleado: lote.id_empleado || null,
    },
  };
};

export const registrarNuevoLoteAnimal = async (req, res) => {
  try {
    const sesion = obtenerSesionRequest(req);
    const datosSolicitud = {
      ...(req.body || {}),
      lote: {
        ...(req.body?.lote || {}),
        id_empleado: sesion.idUsuario,
      },
    };
    const errores = validarDatos(datosSolicitud, sesion.idUsuario);

    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos invalidos para registrar lote/animal.',
        details: errores,
      });
    }

    const resultado = await registrarLoteAnimal(normalizarDatos(datosSolicitud));

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
    const sesion = obtenerSesionRequest(req);
    const idNegocio = req.query?.id_negocio ? Number(req.query.id_negocio) : null;
    const especie = texto(req.query?.especie).toUpperCase();
    const estado = texto(req.query?.estado).toLowerCase();
    const fechaIngreso = texto(req.query?.fecha_ingreso);

    if (req.query?.id_negocio && !Number.isInteger(idNegocio)) {
      return res.status(400).json({ success: false, error: 'id_negocio no es valido.' });
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
      sesion,
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
    const sesion = obtenerSesionRequest(req);
    const idLote = Number(req.body?.id_lote);
    const estado = texto(req.body?.estado).toLowerCase();

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({ success: false, error: 'id_lote no es valido.' });
    }

    if (!ESTADOS_LOTE.includes(estado)) {
      return res.status(400).json({ success: false, error: 'estado no es valido.' });
    }

    const resultado = await cambiarEstadoLote({ idLote, estado, sesion });

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
    const sesion = obtenerSesionRequest(req);
    const idLote = Number(req.body?.id_lote);

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({ success: false, error: 'id_lote no es valido.' });
    }

    const errores = validarEdicion(req.body?.lote, req.body?.animal);
    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Los datos del lote no son validos.',
        details: errores,
      });
    }

    const resultado = await actualizarLoteAnimal({
      idLote,
      sesion,
      lote: req.body?.lote,
      animal: req.body?.animal,
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
    const sesion = obtenerSesionRequest(req);
    const idLote = Number(req.query?.id_lote || req.body?.id_lote);

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({ success: false, error: 'id_lote no es valido.' });
    }

    const resultado = await eliminarLote({ idLote, sesion });

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

export const registrarSalida = async (req, res) => {
  try {
    const sesion = obtenerSesionRequest(req);
    const idLote = Number(req.body?.id_lote);
    const pesoSalida = Number(req.body?.peso_salida);
    const idCorte = req.body?.id_corte == null || req.body?.id_corte === ''
      ? null
      : Number(req.body.id_corte);
    const tipoCorte = texto(req.body?.tipo_corte) || null;
    const tipRecomendacion = texto(req.body?.tip_recomendacion) || null;

    if (!Number.isInteger(idLote) || idLote <= 0) {
      return res.status(400).json({ success: false, error: 'id_lote no es válido.' });
    }

    if (!Number.isFinite(pesoSalida) || pesoSalida <= 0) {
      return res.status(400).json({ success: false, error: 'peso_salida debe ser un número mayor a 0.' });
    }

    if (idCorte !== null && (!Number.isInteger(idCorte) || idCorte <= 0)) {
      return res.status(400).json({ success: false, error: 'id_corte no es válido.' });
    }

    const resultado = await registrarSalidaLote({
      idLote,
      pesoSalida,
      idCorte,
      tipoCorte,
      tipRecomendacion,
      sesion,
    });

    return res.status(200).json({
      success: true,
      message: 'Salida de inventario registrada correctamente.',
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
