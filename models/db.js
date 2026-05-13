const { Sequelize, DataTypes } = require("sequelize"); // Capital S
const path = require("path");

// Create the instance (lowercase s)
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(__dirname, "../database.sqlite"),
  logging: false,
});

// Export both the instance and the DataTypes
module.exports = { sequelize, DataTypes };