import { registrarNegocio } from '../services/negocioService.js';
import { handleError } from '../utils/errorHandler.js';

export const registrarNuevoNegocio = async (req, res) => {
  try {
    const datosEnvio = req.body;

    // Validación básica de seguridad (Capa de Controlador)
    if (!datosEnvio.email || !datosEnvio.contrasena || !datosEnvio.rfc) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos obligatorios para el registro.' 
      });
    }

    // Llamada a la capa de servicio
    await registrarNegocio(datosEnvio);

    // Respuesta exitosa
    return res.status(201).json({
      success: true,
      message: 'Tu negocio ha sido registrado exitosamente. Se encuentra pendiente de verificación.'
    });

  } catch (error) {
    // Delegamos el error a nuestra utilidad estándar
    return handleError(res, error);
  }
};
