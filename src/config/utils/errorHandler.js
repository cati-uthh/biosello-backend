export const handleError = (res, error) => {
  console.error('[Error del Sistema]:', error);

  // Error 1062 es específico de MySQL para "Duplicate Entry" (ej. correo o RFC repetido)
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ 
      success: false, 
      error: 'El correo electrónico o el RFC ya se encuentran registrados.' 
    });
  }

  // Error genérico del servidor
  return res.status(500).json({ 
    success: false, 
    error: 'Ocurrió un error interno en el servidor.' 
  });
};