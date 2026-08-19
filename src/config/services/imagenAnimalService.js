import pool from '../db';

export const imagenAnimalEstaAsociada = async (pathname) => {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute(
      'SELECT id_animal FROM animal WHERE imagen_animal_pathname = ? LIMIT 1',
      [pathname]
    );
    return rows.length > 0;
  } finally {
    connection.release();
  }
};
