const { Sequelize, DataTypes } = require("sequelize");
require('dotenv').config();

// Use the Supabase Connection String from environment variables
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Required for Render to connect to Supabase
    }
  }
});

// Test the connection (Optional but helpful for debugging)
sequelize.authenticate()
  .then(() => console.log('Successfully connected to Supabase PostgreSQL!'))
  .catch(err => console.error('Unable to connect to the database:', err));

module.exports = { sequelize, DataTypes };