const {sequelize,DataTypes} = require("./db")  
const Event = sequelize.define("Event",{
     image:{type:DataTypes.TEXT,allowNull:false}, 
     title:{type:DataTypes.STRING,allowNull:false}, 
     date:{type:DataTypes.DATEONLY,allowNull:false}, 
     time:{type:DataTypes.STRING,allowNull:false}, 
     location: { type: DataTypes.STRING,allowNull:false },
     description: { type: DataTypes.TEXT, allowNull: false },
},
{
  freezeTableName: true // This is the "Stop Pluralizing" switch
})
module.exports = Event;