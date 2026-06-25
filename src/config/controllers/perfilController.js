import { actualizarPerfil, obtenerPerfil } from '../services/perfilService.js';
import { handleError } from '../utils/errorHandler.js';

const texto = (valor) => String(valor ?? '').trim();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rfcRegex = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/i;

export const consultarPerfil = async (req, res) => {
  try {
    const idUsuario = Number(req.query?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(400).json({ success: false, error: 'id_usuario no es válido.' });
    }

    const perfil = await obtenerPerfil(idUsuario);
    return res.status(200).json({ success: true, data: perfil });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }

    return handleError(res, error);
  }
};

export const guardarPerfil = async (req, res) => {
  try {
    const idUsuario = Number(req.body?.id_usuario);
    const nombre = texto(req.body?.nombre);
    const email = texto(req.body?.email).toLowerCase();
    const telefono = texto(req.body?.telefono);
    const nombreNegocio = texto(req.body?.nombre_negocio);
    const municipio = texto(req.body?.municipio);
    const direccion = texto(req.body?.direccion);
    const rfc = texto(req.body?.rfc).toUpperCase();
    const errores = [];

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) errores.push('id_usuario no es válido.');
    if (nombre.length < 3) errores.push('El nombre debe tener al menos 3 caracteres.');
    if (!emailRegex.test(email)) errores.push('El correo electrónico no tiene un formato válido.');
    if (telefono && !/^\d{10}$/.test(telefono)) errores.push('El teléfono debe tener 10 dígitos.');
    if (!nombreNegocio) errores.push('El nombre del negocio es obligatorio.');
    if (!municipio) errores.push('El municipio es obligatorio.');
    if (!direccion) errores.push('La dirección es obligatoria.');
    if (rfc && !rfcRegex.test(rfc)) errores.push('El RFC no tiene un formato válido.');

    if (errores.length > 0) {
      return res.status(400).json({ success: false, error: 'Datos inválidos para actualizar la cuenta.', details: errores });
    }

    const perfil = await actualizarPerfil({
      idUsuario,
      nombre,
      email,
      telefono,
      nombreNegocio,
      municipio,
      direccion,
      rfc,
    });

    return res.status(200).json({ success: true, message: 'Perfil actualizado correctamente.', data: perfil });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }

    return handleError(res, error);
  }
};
