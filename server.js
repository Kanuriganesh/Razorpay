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
app.set("trust proxy", 1);
app.use(express.json());
   

app.use(cors({
  origin: [
    'http://localhost:5173', // Main Website
    'http://localhost:5174',  // Admin Panel    
    'https://razorpay-ia3u.onrender.com', // Self-referential fallback    
    'https://church-admin-drab.vercel.app/'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE','OPTIONS'],
  credentials: true,  
  allowedHeaders: ['Content-Type', 'Authorization']
}));


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

app.use("/api/admin", adminRoutes);  //just add the Routes   

// A simple route to see all donations in your browser