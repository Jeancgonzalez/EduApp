const { Sequelize } = require('sequelize');


// Recomiendo Sequelize porque se integra de forma excelente con Node, MySQL y arquitectura MVC.
const useSSL = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    dialectOptions: useSSL ? { ssl: { rejectUnauthorized: false } } : {},
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 30000,
      evict: 1000,
      validate: (connection) => {
        return connection.promise().query('SELECT 1').then(() => true).catch(() => false);
      },
    },
  }
);


const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a la base de datos MySQL establecida correctamente.');
  } catch (error) {
    console.error('❌ Error al conectar a la base de datos:', error.message);
    throw error;
  }
};

module.exports = { sequelize, testConnection };
