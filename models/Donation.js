const { sequelize, DataTypes } = require("./db");

// 2. Define the Donation Model
const Donation = sequelize.define("Donation", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  amount: {
    type: DataTypes.FLOAT, // Use FLOAT for currency/numbers
    allowNull: false,
  },
  razorpay_order_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  razorpay_payment_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: "success",
  },
  razorpay_signature: {   // Add this field
    type: DataTypes.STRING,
    allowNull: false,
  }
});


// 3. Export both the model and the connection
module.exports =Donation;