import pool from '../db';
import bcrypt from 'bcrypt';
import { put } from '@vercel/blob';

export const registrarNegocio = async (datosNegocio) => {
  const {
    nombre, email, telefono, contrasena,
    nombre_negocio, municipio, direccion, rfc, 
    archivoBase64, nombreArchivo // <--- Recibimos el archivo en texto
  } = datosNegocio;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let documentoUrlFinal = null;

    // 1. Si el usuario subió un documento, se guarda en Vercel Blob
    if (archivoBase64 && nombreArchivo) {
      // Convertimos el texto Base64 de nuevo a un archivo binario (Buffer)
      const buffer = Buffer.from(archivoBase64, 'base64');
      
      // Subimos el archivo a Vercel Blob
      const blob = await put(`documentos/${Date.now()}-${nombreArchivo}`, buffer, {
        access: 'public',
      });
      
      // Vercel nos devuelve la URL pública y segura
      documentoUrlFinal = blob.url;
    }

    // 2. Encriptación de contraseña
    const saltRounds = 10;
    const contrasenaHash = await bcrypt.hash(contrasena, saltRounds);

    // 3. Insertar Usuario
    const queryUser = `
      INSERT INTO usuario (nombre, email, telefono, contrasena_hash, perfil, activo)
      VALUES (?, ?, ?, ?, 'admin', 1)
    `;
    const [userResult] = await connection.execute(queryUser, [nombre, email, telefono, contrasenaHash]);
    const idAdmin = userResult.insertId;

    // 4. Insertar Negocio (usando la URL del documento que nos dio Vercel)
    const queryNegocio = `
      INSERT INTO negocio (nombre_negocio, municipio, direccion, rfc, documento_url, estatus_verificacion, id_admin)
      VALUES (?, ?, ?, ?, ?, 'pendiente', ?)
    `;
    await connection.execute(queryNegocio, [nombre_negocio, municipio, direccion, rfc, documentoUrlFinal, idAdmin]);

    await connection.commit();
    return { success: true };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};