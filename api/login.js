import pool from '../src/config/db';
import bcrypt from 'bcryptjs';
import { crearTokenSesion, normalizarPerfilAcceso } from '../src/config/utils/auth.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Método no permitido.' });
    }

    const identificador = String(req.body?.email || req.body?.identificador || '').trim().toLowerCase();
    const contrasena = String(req.body?.contrasena || '');

    if (!identificador || !contrasena) {
        return res.status(400).json({ success: false, error: 'Ingresa correo o teléfono y tu contraseña.' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        // Permite buscar por correo electrónico o número de teléfono de 10 dígitos
        const query = `
            SELECT
                u.id_usuario,
                u.nombre,
                u.email,
                u.telefono,
                u.contrasena_hash,
                u.perfil,
                u.activo,
                COALESCE(negocio_admin.id_negocio, negocio_empleado.id_negocio) AS id_negocio,
                COALESCE(negocio_admin.nombre_negocio, negocio_empleado.nombre_negocio) AS nombre_negocio,
                COALESCE(negocio_admin.estatus_verificacion, negocio_empleado.estatus_verificacion) AS estatus_verificacion,
                en.puesto
            FROM usuario u
            LEFT JOIN negocio negocio_admin ON u.id_usuario = negocio_admin.id_admin
            LEFT JOIN empleado_negocio en ON u.id_usuario = en.id_usuario AND en.activo = 1
            LEFT JOIN negocio negocio_empleado ON en.id_negocio = negocio_empleado.id_negocio
            WHERE u.email = ? OR u.telefono = ?
            ORDER BY negocio_admin.id_negocio_padre IS NULL DESC, negocio_admin.id_negocio ASC
            LIMIT 1
        `;

        const [rows] = await connection.execute(query, [identificador, identificador]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'No existe una cuenta registrada con esas credenciales.' });
        }

        const usuario = rows[0];

        if (usuario.activo === 0) {
            return res.status(403).json({ success: false, error: 'Esta cuenta fue desactivada por el administrador.' });
        }

        if (normalizarPerfilAcceso(usuario.perfil) === 'empleado' && !usuario.id_negocio) {
            return res.status(403).json({
                success: false,
                error: 'Esta cuenta de empleado ya no está asociada a una sucursal activa.'
            });
        }

        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

        if (!contrasenaValida) {
            return res.status(401).json({ success: false, error: 'La contraseña es incorrecta.' });
        }

        const token = crearTokenSesion({
            idUsuario: usuario.id_usuario,
            perfil: usuario.perfil
        });

        return res.status(200).json({
            success: true,
            mensaje: 'Inicio de sesión exitoso.',
            token,
            usuario: {
                id: usuario.id_usuario,
                id_usuario: usuario.id_usuario,
                nombre: usuario.nombre,
                email: usuario.email,
                telefono: usuario.telefono,
                perfil: usuario.perfil,
                puesto: usuario.puesto,
                id_negocio: usuario.id_negocio,
                nombre_negocio: usuario.nombre_negocio,
                estatus_negocio: usuario.estatus_verificacion
            }
        });
    } catch (error) {
        console.error('Error en el login:', error);
        return res.status(500).json({ success: false, error: 'Ocurrió un error interno en el servidor.' });
    } finally {
        if (connection) connection.release();
    }
}
