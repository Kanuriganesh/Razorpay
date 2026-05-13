const { sequelize, DataTypes } = require("./db");

const Announcement = sequelize.define("Announcement", {
  title: { type: DataTypes.STRING, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  time: { type: DataTypes.STRING  , allowNull:false},
  location: { type: DataTypes.STRING,allowNull:false },
  
  description: { type: DataTypes.TEXT, allowNull: false },
},{
  freezeTableName: true // This is the "Stop Pluralizing" switch
});

module.exports = Announcement;