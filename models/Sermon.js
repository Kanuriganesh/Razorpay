const { sequelize, DataTypes } = require("./db")

const Sermon = sequelize.define("Sermon", {
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    youtube_url: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
},{
  freezeTableName: true // This is the "Stop Pluralizing" switch
})
module.exports = Sermon
