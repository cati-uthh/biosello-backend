import jwt from 'jsonwebtoken';

const ALGORITMO_JWT = 'HS256';
const EMISOR_JWT = 'biosello-backend';
const AUDIENCIA_JWT = 'biosello-app';
const DURACION_SESION = '12h';

const crearErrorAuth = (message, statusCode = 401, code = 'AUTH_REQUIRED') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const obtenerSecreto = () => {
  const secreto = String(process.env.JWT_SECRET || '');
  if (secreto.length < 32) {
    const error = new Error('JWT_SECRET debe configurarse con al menos 32 caracteres.');
    error.code = 'JWT_SECRET_NOT_CONFIGURED';
    throw error;
  }
  return secreto;
};

export const normalizarPerfilAcceso = (perfil) => {
  const valor = String(perfil || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (valor === 'admin' || valor === 'administrador') return 'admin';
  if (valor === 'empleado' || valor === 'employee') return 'empleado';
  return valor;
};

export const crearTokenSesion = ({ idUsuario, perfil }) => jwt.sign(
  { perfil: normalizarPerfilAcceso(perfil) },
  obtenerSecreto(),
  {
    algorithm: ALGORITMO_JWT,
    subject: String(idUsuario),
    issuer: EMISOR_JWT,
    audience: AUDIENCIA_JWT,
    expiresIn: DURACION_SESION,
  }
);

const verificarToken = (token) => {
  let payload;
  try {
    payload = jwt.verify(String(token || ''), obtenerSecreto(), {
      algorithms: [ALGORITMO_JWT],
      issuer: EMISOR_JWT,
      audience: AUDIENCIA_JWT,
      clockTolerance: 5,
    });
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      throw crearErrorAuth('La sesión expiró. Inicia sesión nuevamente.', 401, 'EXPIRED_TOKEN');
    }
    throw crearErrorAuth('La sesión no es válida. Inicia sesión nuevamente.', 401, 'INVALID_TOKEN');
  }

  const idUsuario = Number(payload?.sub);
  const perfil = normalizarPerfilAcceso(payload?.perfil);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0 || !perfil) {
    throw crearErrorAuth('La sesión no es válida. Inicia sesión nuevamente.', 401, 'INVALID_TOKEN');
  }

  return {
    idUsuario,
    perfil,
  };
};

export const obtenerSesionRequest = (req) => {
  const authorization = String(req.headers?.authorization || '');
  const coincidencia = authorization.match(/^Bearer\s+(.+)$/i);
  if (!coincidencia) {
    throw crearErrorAuth('Debes iniciar sesión para realizar esta acción.');
  }
  return verificarToken(coincidencia[1].trim());
};

export const obtenerAdministradorRequest = (req) => {
  const sesion = obtenerSesionRequest(req);
  if (sesion.perfil !== 'admin') {
    throw crearErrorAuth(
      'Solo una cuenta administradora puede gestionar empleados.',
      403,
      'ADMIN_REQUIRED'
    );
  }
  return sesion;
};
