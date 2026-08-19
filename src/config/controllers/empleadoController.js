import {
  actualizarEmpleadoDelNegocio,
  crearEmpleadoDelNegocio,
  desactivarEmpleadoDelNegocio,
  obtenerEmpleadosDelNegocio,
} from '../services/empleadoService.js';
import { handleError } from '../utils/errorHandler.js';
import { obtenerAdministradorRequest } from '../utils/auth.js';

const texto = (valor) => String(valor ?? '').trim();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordValida = (valor) => (
  valor.length >= 8
  && valor.length <= 72
  && /[A-ZÁÉÍÓÚÑ]/.test(valor)
  && /[a-záéíóúñ]/.test(valor)
  && /\d/.test(valor)
);

const enteroPositivo = (valor) => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
};

const validarDatosEmpleado = (body, { contrasenaObligatoria }) => {
  const datos = {
    nombre: texto(body?.nombre),
    email: texto(body?.email).toLowerCase(),
    telefono: texto(body?.telefono),
    puesto: texto(body?.puesto),
    contrasena: String(body?.contrasena || ''),
  };
  const errores = [];

  if (datos.nombre.length < 3 || datos.nombre.length > 100) {
    errores.push('El nombre debe tener entre 3 y 100 caracteres.');
  }
  if (datos.email.length > 100 || !emailRegex.test(datos.email)) {
    errores.push('El correo electrónico no tiene un formato válido.');
  }
  if (!/^\d{10}$/.test(datos.telefono)) {
    errores.push('El teléfono debe tener exactamente 10 dígitos.');
  }
  if (datos.puesto.length < 2 || datos.puesto.length > 80) {
    errores.push('El puesto debe tener entre 2 y 80 caracteres.');
  }
  if ((contrasenaObligatoria || datos.contrasena) && !passwordValida(datos.contrasena)) {
    errores.push('La contraseña debe tener entre 8 y 72 caracteres, mayúscula, minúscula y número.');
  }

  return { datos, errores };
};

const responderError = (res, error) => {
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      error: 'El correo electrónico o teléfono ya está registrado.',
      code: 'EMPLEADO_DUPLICADO',
    });
  }
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
  }
  return handleError(res, error);
};

export const listarEmpleados = async (req, res) => {
  try {
    const { idUsuario: idAdmin } = obtenerAdministradorRequest(req);
    const idNegocio = enteroPositivo(req.query?.id_negocio);

    if (!idNegocio) {
      return res.status(400).json({
        success: false,
        error: 'id_negocio es obligatorio y debe ser válido.',
      });
    }

    const empleados = await obtenerEmpleadosDelNegocio({ idNegocio, idAdmin });
    return res.status(200).json({ success: true, data: empleados });
  } catch (error) {
    return responderError(res, error);
  }
};

export const crearEmpleado = async (req, res) => {
  try {
    const { idUsuario: idAdmin } = obtenerAdministradorRequest(req);
    const idNegocio = enteroPositivo(req.body?.id_negocio);
    const { datos, errores } = validarDatosEmpleado(req.body, { contrasenaObligatoria: true });

    if (!idNegocio) {
      errores.push('id_negocio es obligatorio y debe ser válido.');
    }
    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Los datos del empleado no son válidos.',
        details: errores,
      });
    }

    const empleado = await crearEmpleadoDelNegocio({ idNegocio, idAdmin, ...datos });
    return res.status(201).json({
      success: true,
      message: 'Empleado registrado correctamente.',
      data: empleado,
    });
  } catch (error) {
    return responderError(res, error);
  }
};

export const actualizarEmpleado = async (req, res) => {
  try {
    const { idUsuario: idAdmin } = obtenerAdministradorRequest(req);
    const idEmpleado = enteroPositivo(req.body?.id_empleado || req.body?.id_usuario);
    const idNegocio = enteroPositivo(req.body?.id_negocio);
    const { datos, errores } = validarDatosEmpleado(req.body, { contrasenaObligatoria: false });

    if (!idEmpleado || !idNegocio) {
      errores.push('id_empleado e id_negocio son obligatorios y deben ser válidos.');
    }
    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Los datos del empleado no son válidos.',
        details: errores,
      });
    }

    const empleado = await actualizarEmpleadoDelNegocio({
      idEmpleado,
      idNegocio,
      idAdmin,
      ...datos,
    });
    return res.status(200).json({
      success: true,
      message: 'Empleado actualizado correctamente.',
      data: empleado,
    });
  } catch (error) {
    return responderError(res, error);
  }
};

export const eliminarEmpleado = async (req, res) => {
  try {
    const { idUsuario: idAdmin } = obtenerAdministradorRequest(req);
    const idEmpleado = enteroPositivo(req.body?.id_empleado || req.body?.id_usuario);
    const idNegocio = enteroPositivo(req.body?.id_negocio);

    if (!idEmpleado || !idNegocio) {
      return res.status(400).json({
        success: false,
        error: 'id_empleado e id_negocio son obligatorios y deben ser válidos.',
      });
    }
    if (idEmpleado === idAdmin) {
      return res.status(400).json({
        success: false,
        error: 'La cuenta administradora no puede eliminarse desde el módulo de empleados.',
      });
    }

    await desactivarEmpleadoDelNegocio({ idEmpleado, idNegocio, idAdmin });
    return res.status(200).json({
      success: true,
      message: 'El acceso del empleado fue desactivado. Su historial se conserva.',
    });
  } catch (error) {
    return responderError(res, error);
  }
};
