import { del, put } from '@vercel/blob';
import { imagenAnimalEstaAsociada } from '../src/config/services/imagenAnimalService.js';
import { obtenerSesionRequest } from '../src/config/utils/auth.js';

const MAXIMO_BYTES = 3 * 1024 * 1024;
const MAXIMO_BASE64 = Math.ceil(MAXIMO_BYTES * 4 / 3) + 8;
const TIPOS_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const responderError = (res, error) => {
  const statusCode = error?.statusCode || 400;
  return res.status(statusCode).json({
    success: false,
    error: error?.message || 'No se pudo procesar la fotografia.',
    code: error?.code || 'IMAGE_UPLOAD_ERROR',
  });
};

const crearError = (message, code = 'INVALID_IMAGE') => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
};

const extensionParaMime = (mimeType) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

const nombreSeguro = (valor, mimeType) => {
  const base = String(valor || 'animal')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'animal';
  return `${base}.${extensionParaMime(mimeType)}`;
};

const firmaCoincide = (buffer, mimeType) => {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buffer.length >= firma.length && firma.every((byte, indice) => buffer[indice] === byte);
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
};

const decodificarImagen = ({ archivoBase64, mimeType, tamanioBytes }) => {
  const tipo = String(mimeType || '').trim().toLowerCase();
  if (!TIPOS_PERMITIDOS.has(tipo)) {
    throw crearError('Formato no permitido. Usa JPG, JPEG, PNG o WEBP.', 'INVALID_IMAGE_TYPE');
  }

  const base64 = String(archivoBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!base64 || base64.length > MAXIMO_BASE64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw crearError('El contenido de la fotografia no es valido.', 'INVALID_IMAGE_CONTENT');
  }

  const buffer = Buffer.from(base64, 'base64');
  const tamanioDeclarado = Number(tamanioBytes);
  if (
    buffer.length <= 0
    || buffer.length > MAXIMO_BYTES
    || !Number.isFinite(tamanioDeclarado)
    || tamanioDeclarado !== buffer.length
  ) {
    throw crearError('La fotografia supera 3 MB o su tamaño no coincide.', 'INVALID_IMAGE_SIZE');
  }
  if (!firmaCoincide(buffer, tipo)) {
    throw crearError('El contenido del archivo no corresponde al formato indicado.', 'IMAGE_SIGNATURE_MISMATCH');
  }

  return { buffer, mimeType: tipo };
};

const rutaPermitida = (pathname, idUsuario) => {
  const ruta = String(pathname || '').replace(/^\/+/, '');
  return ruta.startsWith(`animales/${idUsuario}/`) ? ruta : null;
};

const urlBlobPublicaValida = (valor, pathname) => {
  try {
    const url = new URL(String(valor || ''));
    return (
      url.protocol === 'https:'
      && url.hostname.endsWith('.public.blob.vercel-storage.com')
      && decodeURIComponent(url.pathname).replace(/^\/+/, '') === pathname
    );
  } catch (error) {
    return false;
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const sesion = obtenerSesionRequest(req);
      const { buffer, mimeType } = decodificarImagen(req.body || {});
      const archivo = nombreSeguro(req.body?.nombre, mimeType);
      const blob = await put(`animales/${sesion.idUsuario}/${Date.now()}-${archivo}`, buffer, {
        access: 'public',
        addRandomSuffix: true,
        contentType: mimeType,
        cacheControlMaxAge: 31_536_000,
      });

      return res.status(201).json({
        success: true,
        data: {
          url: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType || mimeType,
        },
      });
    } catch (error) {
      return responderError(res, error);
    }
  }

  if (req.method === 'DELETE') {
    try {
      const sesion = obtenerSesionRequest(req);
      const pathname = rutaPermitida(req.body?.pathname, sesion.idUsuario);
      const url = String(req.body?.url || '').trim();

      if (!pathname || !urlBlobPublicaValida(url, pathname)) {
        return res.status(400).json({ success: false, error: 'La referencia de la fotografia no es valida.' });
      }
      if (await imagenAnimalEstaAsociada(pathname)) {
        return res.status(409).json({
          success: false,
          error: 'La fotografia ya esta asociada a un animal y no puede eliminarse como temporal.',
        });
      }

      await del(url);
      return res.status(200).json({ success: true });
    } catch (error) {
      return responderError(res, error);
    }
  }

  return res.status(405).json({ success: false, error: 'Metodo no permitido.' });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4.4mb',
    },
  },
};
