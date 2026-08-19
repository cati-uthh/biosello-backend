import { del, put } from '@vercel/blob';

const MAXIMO_BYTES = 5 * 1024 * 1024;
const MAXIMO_BASE64 = Math.ceil(MAXIMO_BYTES * 4 / 3) + 8;

const TIPOS_POR_EXTENSION = new Map([
  ['pdf', 'application/pdf'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
]);

const crearError = (message, code = 'DOCUMENTO_INVALIDO') => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
};

const nombreSeguro = (nombreOriginal) => {
  const nombre = String(nombreOriginal || '').trim();
  const coincidencia = nombre.match(/\.([a-zA-Z0-9]+)$/);
  const extension = coincidencia?.[1]?.toLowerCase();
  const contentType = TIPOS_POR_EXTENSION.get(extension);

  if (!contentType) {
    throw crearError('El documento debe ser PDF, JPG, JPEG o PNG.', 'TIPO_DOCUMENTO_INVALIDO');
  }

  const base = nombre
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'documento';
  const extensionFinal = contentType === 'image/jpeg' ? 'jpg' : extension;

  return {
    contentType,
    nombre: `${base}.${extensionFinal}`,
  };
};

const firmaCoincide = (buffer, contentType) => {
  if (contentType === 'application/pdf') {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buffer.length >= firma.length
      && firma.every((byte, indice) => buffer[indice] === byte);
  }
  return false;
};

export const decodificarDocumento = ({ archivoBase64, nombreArchivo }) => {
  const { contentType, nombre } = nombreSeguro(nombreArchivo);
  const base64 = String(archivoBase64 || '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s/g, '');

  if (
    !base64
    || base64.length > MAXIMO_BASE64
    || base64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    throw crearError(
      'El contenido del documento no es válido o supera 5 MB.',
      'CONTENIDO_DOCUMENTO_INVALIDO'
    );
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length <= 0 || buffer.length > MAXIMO_BYTES) {
    throw crearError('El documento supera el máximo permitido de 5 MB.', 'DOCUMENTO_DEMASIADO_GRANDE');
  }
  if (!firmaCoincide(buffer, contentType)) {
    throw crearError(
      'El contenido del archivo no corresponde con su extensión.',
      'FIRMA_DOCUMENTO_INVALIDA'
    );
  }

  return { buffer, contentType, nombre };
};

export const subirDocumentoPublico = async ({ archivoBase64, nombreArchivo, carpeta }) => {
  const { buffer, contentType, nombre } = decodificarDocumento({
    archivoBase64,
    nombreArchivo,
  });
  const ruta = String(carpeta || 'documentos')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '');

  const blob = await put(`${ruta}/${Date.now()}-${nombre}`, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType,
  });

  return blob.url;
};

export const eliminarDocumentoPublico = async (urlDocumento) => {
  const valor = String(urlDocumento || '').trim();
  let url;

  try {
    url = new URL(valor);
  } catch (error) {
    throw crearError('La URL del documento no es valida.', 'URL_DOCUMENTO_INVALIDA');
  }

  if (
    url.protocol !== 'https:'
    || !url.hostname.endsWith('.public.blob.vercel-storage.com')
  ) {
    throw crearError(
      'El documento no pertenece al almacenamiento publico configurado.',
      'URL_DOCUMENTO_INVALIDA'
    );
  }

  await del(valor);
};
