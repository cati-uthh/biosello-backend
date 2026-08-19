import { createHmac, timingSafeEqual } from 'node:crypto';

const DURACION_SESION_SEGUNDOS = 12 * 60 * 60;
const PREFIJO_TOKEN = 'biosello-v1';

const crearErrorAuth = (message, statusCode = 401, code = 'AUTH_REQUIRED') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const obtenerSecreto = () => {
  const secreto = String(process.env.AUTH_SECRET || '');
  if (secreto.length < 32) {
    const error = new Error('AUTH_SECRET debe configurarse con al menos 32 caracteres.');
    error.code = 'AUTH_SECRET_NOT_CONFIGURED';
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

const firmar = (contenido) => createHmac('sha256', obtenerSecreto())
  .update(contenido)
  .digest('base64url');

export const crearTokenSesion = ({ idUsuario, perfil }) => {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: String(idUsuario),
    perfil: normalizarPerfilAcceso(perfil),
    iat: ahora,
    exp: ahora + DURACION_SESION_SEGUNDOS,
  })).toString('base64url');
  const contenidoFirmado = `${PREFIJO_TOKEN}.${payload}`;
  return `${contenidoFirmado}.${firmar(contenidoFirmado)}`;
};

const verificarToken = (token) => {
  const partes = String(token || '').split('.');
  if (partes.length !== 3 || partes[0] !== PREFIJO_TOKEN) {
    throw crearErrorAuth('La sesión no es válida. Inicia sesión nuevamente.', 401, 'INVALID_TOKEN');
  }

  const contenidoFirmado = `${partes[0]}.${partes[1]}`;
  const firmaRecibida = Buffer.from(partes[2], 'base64url');
  const firmaEsperada = Buffer.from(firmar(contenidoFirmado), 'base64url');
  if (
    firmaRecibida.length !== firmaEsperada.length
    || !timingSafeEqual(firmaRecibida, firmaEsperada)
  ) {
    throw crearErrorAuth('La sesión no es válida. Inicia sesión nuevamente.', 401, 'INVALID_TOKEN');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch (error) {
    throw crearErrorAuth('La sesión no es válida. Inicia sesión nuevamente.', 401, 'INVALID_TOKEN');
  }

  const idUsuario = Number(payload?.sub);
  const ahora = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0 || !Number.isFinite(payload?.exp) || payload.exp <= ahora) {
    throw crearErrorAuth('La sesión expiró. Inicia sesión nuevamente.', 401, 'EXPIRED_TOKEN');
  }

  return {
    idUsuario,
    perfil: normalizarPerfilAcceso(payload.perfil),
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
