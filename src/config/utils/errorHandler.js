export const handleError = (res, error) => {
  console.error('[Error del Sistema]:', error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message || 'La solicitud no pudo procesarse.',
      code: error.code || 'REQUEST_ERROR'
    });
  }

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      error: 'El correo electrónico, RFC, lote o arete ya se encuentran registrados.'
    });
  }

  if (error.code === 'WARN_DATA_TRUNCATED') {
    return res.status(400).json({
      success: false,
      error: 'Uno de los valores enviados no existe en la base de datos. Revisa estado, especie o clasificación.'
    });
  }

  return res.status(500).json({
    success: false,
    error: 'Ocurrió un error interno en el servidor.'
  });
};
