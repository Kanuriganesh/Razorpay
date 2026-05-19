const express = require("express");
const cors = require("cors");
require('dotenv').config();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Donation = require("./models/Donation");    
const adminRoutes = require("./routes/adminRoutes");      
const {sequelize} = require("./models/db")
const Announcement = require("./models/Announcement");
const Event = require("./models/Event");
const Sermon = require("./models/Sermon");
const Gallery = require("./models/Gallery");     

const path = require("path")
// Start Server and Sync Database
const PORT = process.env.PORT || 10000;
const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);  //just add the Routes      

app.use(cors({
  origin: [
    'http://localhost:5173', // Main Website
    'http://localhost:5174',  // Admin Panel    
    'https://razorpay-ia3u.onrender.com' // Self-referential fallback
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});    

sequelize.sync()
  .then(() => {
    console.log("✅ SQLite Connected & Database Synced");
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ SQLite Connection Error:", err);
  });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route to create an order
app.post("/api/payment/order", async (req, res) => {
  try {
    const options = {
      amount: req.body.amount * 100, // Amount in paise
      currency: "INR",
      receipt: "receipt_" + Math.random().toString(36).substring(7),
    };
    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Route to verify payment
app.post("/api/payment/verify", async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature, 
    name, email, phone, amount 
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    try {
      // Sequelize uses .create() instead of new Donation().save()
      await Donation.create({
        name,
        email,
        phone,
        amount,
        razorpay_order_id,
        razorpay_payment_id,     
        razorpay_signature,
        status: "success"
      });

      res.status(200).json({ message: "Verified and Saved to SQLite!", success: true });
    } catch (error) {
      console.error("Database Save Error:", error);
      res.status(500).json({ message: "Payment verified but save failed", success: false });
    }
  } else {
    res.status(400).json({ message: "Invalid signature", success: false });
  }
});
  

// A simple route to see all donations in your browser
