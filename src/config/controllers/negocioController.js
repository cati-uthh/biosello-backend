import { registrarNegocio } from '../services/negocioServise.js';
import { handleError } from '../utils/errorHandler.js';

const texto = (valor) => String(valor ?? '').trim();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rfcRegex = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/i;
const passwordValida = (valor) => (
  typeof valor === 'string' &&
  valor.length >= 8 &&
  /[A-ZÁÉÍÓÚÑ]/.test(valor) &&
  /[a-záéíóúñ]/.test(valor) &&
  /\d/.test(valor)
);

export const registrarNuevoNegocio = async (req, res) => {
  try {
    const datosEnvio = req.body || {};
    const errores = [];

    if (texto(datosEnvio.nombre).length < 3) errores.push('El nombre del propietario debe tener al menos 3 caracteres.');
    if (!emailRegex.test(texto(datosEnvio.email))) errores.push('El correo electrónico no tiene un formato válido.');
    if (!/^\d{10}$/.test(texto(datosEnvio.telefono))) errores.push('El teléfono debe tener 10 dígitos.');
    if (!passwordValida(datosEnvio.contrasena)) errores.push('La contraseña debe tener mínimo 8 caracteres, mayúscula, minúscula y número.');
    if (!texto(datosEnvio.nombre_negocio)) errores.push('El nombre del negocio es obligatorio.');
    if (!texto(datosEnvio.direccion)) errores.push('La dirección del negocio es obligatoria.');
    if (!rfcRegex.test(texto(datosEnvio.rfc).toUpperCase())) errores.push('El RFC no tiene un formato válido.');

    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos para registrar el negocio.',
        details: errores
      });
    }

    await registrarNegocio({
      ...datosEnvio,
      email: texto(datosEnvio.email).toLowerCase(),
      rfc: texto(datosEnvio.rfc).toUpperCase()
    });

    return res.status(201).json({
      success: true,
      message: 'Tu negocio ha sido registrado exitosamente. Se encuentra pendiente de verificación.'
    });
  } catch (error) {
    return handleError(res, error);
  }
};
