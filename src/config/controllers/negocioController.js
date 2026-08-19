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

    const nombreLimpio = texto(datosEnvio.nombre);
    if (nombreLimpio.length < 3 || nombreLimpio.length > 150) {
        errores.push('El nombre del propietario debe tener entre 3 y 150 caracteres.');
    }
    
    const emailLimpio = texto(datosEnvio.email);
    if (emailLimpio.length > 100 || !emailRegex.test(emailLimpio)) {
        errores.push('El correo electrónico no tiene un formato válido o excede los 100 caracteres.');
    }
    
    if (!/^\d{10}$/.test(texto(datosEnvio.telefono))) {
        errores.push('El teléfono debe tener exactamente 10 dígitos.');
    }
    
    if (!passwordValida(datosEnvio.contrasena)) {
        errores.push('La contraseña debe tener mínimo 8 caracteres, mayúscula, minúscula y número.');
    }
    
    const nombreNegocioLimpio = texto(datosEnvio.nombre_negocio);
    if (!nombreNegocioLimpio || nombreNegocioLimpio.length > 150) {
        errores.push('El nombre del negocio es obligatorio y no debe exceder 150 caracteres.');
    }
    
    const direccionLimpia = texto(datosEnvio.direccion);
    if (!direccionLimpia || direccionLimpia.length > 255) {
        errores.push('La dirección del negocio es obligatoria y no debe exceder 255 caracteres.');
    }
    
    if (!rfcRegex.test(texto(datosEnvio.rfc).toUpperCase())) {
        errores.push('El RFC no tiene un formato válido.');
    }

    if (!datosEnvio.archivoBase64 || !datosEnvio.nombreArchivo) {
      errores.push('Es obligatorio adjuntar el documento (Aviso COFEPRIS o SAT).');
    } else {
      const sizeInMB = (datosEnvio.archivoBase64.length * 0.75) / (1024 * 1024);
      if (sizeInMB > 5) {
        errores.push('El documento adjunto es demasiado grande. El máximo permitido es de 5 MB.');
      }
    }

    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos para registrar el negocio.',
        details: errores
      });
    }

    await registrarNegocio({
      ...datosEnvio,
      email: emailLimpio.toLowerCase(),
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
