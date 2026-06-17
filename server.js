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

// 🚀 ADD THIS TO THE TOP OF YOUR server.js FILE
const { createClient } = require('@supabase/supabase-client');

// Force-load your live environment keys
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Or SUPABASE_ANON_KEY

// Initialize the engine globally
const supabase = createClient(supabaseUrl, supabaseKey);

const path = require("path")
// Start Server and Sync Database
const PORT = process.env.PORT || 10000;
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS','PATCH'],
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
// 🚀 GLOBAL BULLETPROOF WEBHOOK RECEIVER (Paste directly into server.js)
app.post('/twilio-voice-callback', async (req, res) => {
  // 🔥 This log will now print instantly in your Render terminal!
  console.log("🔥 TELEPHONY HANDSHAKE: Twilio global callback receiver route was hit!");
  console.log("📦 RAW REQ.BODY PACKET:", req.body);

  const status = req.body.CallStatus || req.body.callStatus || req.body.Status;
  const duration = req.body.CallDuration || req.body.callDuration || req.body.Duration;
  const destination = req.body.To || req.body.to;

  try {
    if (destination) {
      // Strip out the '+' to match your database column format
      const dbLookupNumber = destination.replace('+', '').trim();
      const finalDuration = duration ? parseInt(duration, 10) : 0;
      const cleanStatus = status ? status.toLowerCase() : 'completed';

      console.log(`💾 Syncing database entry for number: ${dbLookupNumber} | Status: ${cleanStatus} | Duration: ${finalDuration}s`);

      // Update your live Supabase table directly
      const { error } = await supabase
        .from('church_members')
        .update({
          last_call_status: cleanStatus,      // Changes 'queued' to 'completed', 'busy', etc.
          last_call_duration: finalDuration   // Tracks actual conversation seconds
        })
        .eq('phone_number', dbLookupNumber);

      if (error) {
        console.error(`⚠️ Webhook Sync Error for ${destination}:`, error.message);
      } else {
        console.log(`✅ Supabase row synced successfully for target: ${dbLookupNumber}`);
      }
    }
  } catch (err) {
    console.error("🚨 Webhook Critical Catch Block Failure:", err.message);
  }

  // Return an HTTP 204 No Content to tell Twilio everything went great!
  return res.status(204).end();
});
// A simple route to see all donations in your browser