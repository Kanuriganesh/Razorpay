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
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://razorpay-ia3u.onrender.com',
      'https://church-admin-drab.vercel.app',
      'https://church-app-flax.vercel.app' // FIXED: Removed trailing slash string completely
    ];

    // Check if origin matches or belongs to our vercel ecosystems
    const isAllowed = !origin || 
                      allowedOrigins.includes(origin) || 
                      origin.includes('church-admin-drab.vercel.app') || 
                      origin.includes('church-app-flax.vercel.app');

    if (isAllowed) {
      callback(null, true);
    } else {
      // Direct logging to Render console so you can see exactly who tried to connect
      console.log("⚠️ Unauthorized connection origin blocked:", origin);
      callback(null, false); // Safe rejection: returns a clean CORS block instead of throwing a 500 server crash!
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
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