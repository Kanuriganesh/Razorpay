const {sequelize,DataTypes} = require("./db");  

const Gallery = sequelize.define("Gallery", {
  gallery_url: { type: DataTypes.TEXT, allowNull: false }
}, {
  freezeTableName: true // This is the "Stop Pluralizing" switch
});
module.exports = Gallery;
