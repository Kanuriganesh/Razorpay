const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require("crypto");
const Razorpay = require("razorpay");
const supabase = require('../config/supabaseClient'); // Double check your path to config       
const axios = require('axios');   
const twilio = require('twilio');   
const app = express();
// 1. Parses your React JSON payloads
app.use(express.json());

// 🚀 2. THE FIX: Parses Twilio's URL-encoded webhook payloads!
app.use(express.urlencoded({ extended: true }));
// 🔐 Initialize the Twilio SDK Client using explicit environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioCallerId = process.env.TWILIO_PHONE_NUMBER;

// Hard input-validation flag check to prevent application bootstrap crashes
if (!accountSid || !authToken || !twilioCallerId) {
  console.error("❌ CRITICAL CONFIGURATION FAULT: Twilio environment variables are missing.");
}

const client = twilio(accountSid, authToken);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Import all your models
const Announcement = require("../models/Announcement");
const Event = require("../models/Event");
const Sermon = require("../models/Sermon");
const Gallery = require("../models/Gallery");
const Donation = require("../models/Donation")

//TO Get all the data for the donation table 

router.get("/donations", async (req, res) => {
  try {
    const allDonations = await Donation.findAll();
    res.json(allDonations);
  } catch (error) {
    res.status(500).send(error);
  }
});

// --- ANNOUNCEMENTS ROUTES ---

// 1. GET: Fetch all announcements
router.get("/announcements", async (req, res) => {
  try {
    // We try to fetch the data
    const data = await Announcement.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json(data);
  } catch (error) {
    // If the database fails, we catch the error here
    console.error("GET Announcements Error:", error);
    res.status(500).json({
      message: "Failed to retrieve announcements",
      error: error.message
    });
  }
});

// 2. POST: Create a new announcement
router.post("/announcements", async (req, res) => {
  try {
    // Basic validation: Check if title and content exist in req.body
    if (!req.body.title || !req.body.description) {
      return res.status(400).json({ message: "Title and Content are required fields." });
    }
    const newItem = await Announcement.create(req.body);
    res.status(201).json(newItem);
  } catch (error) {
    console.error("POST Announcement Error:", error);

    // Check if it's a Sequelize validation error (e.g., unique constraint)
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: error.errors[0].message });
    }

    res.status(500).json({
      message: "Server error while creating announcement",
      error: error.message
    });
  }
});

//3 UPDATE:update the announcement 
router.put("/announcement/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, date, time, location, description } = req.body;
    // Find the announcement first
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    // Update the fields
    await announcement.update({
      title,
      date,
      time,
      location,
      description
    });
    res.json(announcement);
  } catch (err) {
    console.error("Sequelize Error:", err); // CHECK YOUR TERMINAL FOR THIS
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});
// DELETE an announcement
router.delete('/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Perform the deletion in SQLite via Sequelize
    const deleted = await Announcement.destroy({
      where: { id: id }
    });
    if (deleted) {
      // 204 No Content is also a good professional status for a successful delete
      res.status(200).json({ message: "Announcement deleted successfully" });
    } else {
      res.status(404).json({ message: "Announcement not found" });
    }
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// --- EVENTS ROUTES ---   

// Configure how files are stored
const storage = multer.memoryStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Make sure this folder exists!
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename
  }
});
const upload = multer({ storage: storage });

router.get("/events", async (req, res) => {
  try {
    const data = await Event.findAll({ order: [['date', 'DESC']] });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch events" });
  }
});

// --- THE POST ROUTE ---
router.post("/events", upload.single('image'), async (req, res) => {
  try {
    const { title, date, time, location, description } = req.body;
    let imageUrl = null;
    // Check if an image was uploaded
    if (req.file) {
      // Create a unique filename to avoid overwriting files with the same name
      const fileName = `${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
      // 1. Upload file buffer directly to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('church-assets') // Your bucket name from the screenshot
        .getPublicUrl(fileName);
      if (uploadError) {
        throw new Error(`Supabase upload failed: ${uploadError.message}`);
      }
      // 2. Get the public URL of the uploaded image
      const { data: publicUrlData } = supabase.storage
        .from('church-assets')
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }
    // 3. Save to your database using the cloud URL instead of a local path
    const newItem = await Event.create({
      image: imageUrl, // This will now be a permanent https://... URL
      title,
      date,
      time,
      location,
      description
    });

    res.status(201).json(newItem);
  } catch (err) {
    console.error("Error in /events route:", err);
    res.status(400).json({ message: "Create failed", error: err.message });
  }
});



// --- THE UPDATE ROUTE ---
// --- THE UPDATE ROUTE WITH SUPABASE ---
router.put("/events/:id", upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const eventItem = await Event.findByPk(id);
    if (!eventItem) return res.status(404).json({ message: "Not found" });

    const updateData = { ...req.body };

    // If a new image is provided during update
    if (req.file) {
      const fileName = `${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;

      // 1. ACTUALLY UPLOAD the file buffer to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('church-assets')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Supabase update upload failed: ${uploadError.message}`);
      }

      // 2. Get the new public URL string
      const { data: publicUrlData } = supabase.storage
        .from('church-assets')
        .getPublicUrl(fileName);

      // 3. Attach the permanent cloud URL to the update object
      updateData.image = publicUrlData.publicUrl;
    }

    // Update the database record with the text fields and the new image URL (if uploaded)
    await eventItem.update(updateData);
    res.json(eventItem);
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Event.destroy({
      where: { id: id }
    })
    if (deleted) {
      // 204 No Content is also a good professional status for a successful delete
      res.status(200).json({ message: "Event deleted successfully" });
    } else {
      res.status(404).json({ message: "Event not found" });
    }
  }
  catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
})


// --- SERMON ROUTES ---    
router.put("/sermon/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, youtube_url, description } = req.body;
    const sermonItem = await Sermon.findByPk(id);
    if (!sermonItem) {
      return res.status(404).json({ message: "Not found" });
    }
    await sermonItem.update({
      title, youtube_url, description
    })
    res.json(sermonItem)
  }
  catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
})

router.get("/sermon", async (req, res) => {
  try {


    const data = await Sermon.findAll({ order: [['createdAt', 'DESC']] });
    res.json(data);
  }
  catch (err) {
    res.status(500).json({ message: "Failed to fetch sermon" });
  }
});

router.post("/sermon", async (req, res) => {
  try {
    // Basic validation: Check if title and content exist in req.body
    if (!req.body.title || !req.body.description || !req.body.youtube_url) {
      return res.status(400).json({ message: "Title , Content,youtube_url are required fields." });
    }
    const newItem = await Sermon.create(req.body);
    res.status(201).json(newItem);
  } catch (error) {
    console.error("POST Sermon Error:", error);
    res.status(500).json({
      message: "Server error while creating Sermon",
      error: error.message
    });
  }
});

router.delete("/sermon/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Sermon.destroy({
      where: { id: id }
    })
    if (deleted) {
      res.status(200).json({ message: "Sermon deleted successfully" });
    }
    else {
      res.status(404).json({ message: "Sermon was not found" });
    }
  }
  catch (err) {
    res.status(500).json({ error: "Sermon Server Error" });
  }
})
// --- GALLERY ROUTES ---
router.get("/gallery", async (req, res) => {
  try {
    const data = await Gallery.findAll({ order: [['createdAt', 'DESC']] });
    res.json(data);
  }
  catch (err) {
    res.status(500).json({ message: "Failed to fetch Gallery" });
  }
});

// POST: Upload a new gallery photo to Supabase Storage
router.post("/gallery", upload.single('image'), async (req, res) => {
  try {
    // 1. Check if a file was actually sent by the frontend
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an image file" });
    }

    // 2. Create a clean, unique file path for the bucket
    const fileName = `gallery_${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;

    // 3. Upload file buffer straight to your Supabase bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('church-assets')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Supabase Gallery upload failed: ${uploadError.message}`);
    }

    // 4. Extract the public CDN URL string
    const { data: publicUrlData } = supabase.storage
      .from('church-assets')
      .getPublicUrl(fileName);

    const gallery_url = publicUrlData.publicUrl;

    // 5. Save the absolute cloud URL into your local database table
    const galleryItem = await Gallery.create({ gallery_url });

    res.status(201).json(galleryItem);
  } catch (error) {
    console.error("POST Gallery Error:", error);
    res.status(500).json({ message: "Error uploading to gallery", error: error.message });
  }
});

// PUT: Update an existing gallery photo with a fresh upload
router.put("/gallery/:id", upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const galleryItem = await Gallery.findByPk(id);

    if (!galleryItem) {
      return res.status(404).json({ message: "Image not found" });
    }

    const updateData = {};

    // Only hit Supabase if a brand-new file is provided in the request
    if (req.file) {
      const fileName = `gallery_${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;

      // 1. Upload new image buffer to your bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('church-assets')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Supabase Gallery update failed: ${uploadError.message}`);
      }

      // 2. Grab the new working cloud URL
      const { data: publicUrlData } = supabase.storage
        .from('church-assets')
        .getPublicUrl(fileName);

      updateData.gallery_url = publicUrlData.publicUrl;
    }

    // Update database record with the new path
    await galleryItem.update(updateData);
    res.json(galleryItem);
  } catch (err) {
    console.error("PUT Gallery Error:", err);
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// DELETE: Remove record from database
router.delete("/gallery/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Gallery.destroy({
      where: { id: id }
    });

    if (deleted) {
      res.status(200).json({ message: "Gallery deleted successfully" });
    } else {
      res.status(404).json({ message: "Gallery was not found" });
    }
  } catch (err) {
    res.status(500).json({ error: "Gallery Server Error" });
  }
});


// Route to create an order
router.post("/payment/order", async (req, res) => {
 
  try {
    const rawAmount = parseInt(req.body.amount, 10);
    if (!rawAmount || isNaN(rawAmount)) {
      return res.status(400).json({ message: "Invalid or missing amount parameter" });
    }
    const options = {
      amount: rawAmount * 100, // Amount in paise
      currency: "INR",
      receipt: "receipt_" + Math.random().toString(36).substring(7),
    };
    const order = await razorpay.orders.create(options);
    return res.status(200).json(order);
  } catch (error) {
    console.error("CRITICAL RAZORPAY API CRASH:", error);
    // THIS IS THE TRICK: Send the real error message back to the frontend!
    return res.status(500).json({
      message: "Razorpay core SDK crash",
      errorDescription: error.description || error.message || "Unknown error",
      fullError: error
    });
  }
});

// Route to verify payment
router.post("/payment/verify", async (req, res) => {
 
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      name, email, phone, amount
    } = req.body;

    // 1. Double check that critical signature segments exist
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
     
      return res.status(400).json({ message: "Missing tracking signature parameters", success: false });
    }

    // 2. Generate the local cryptographic signature matching Razorpay rules
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET.trim()) // added .trim() to wipe out hidden spaces!
      .update(body.toString())
      .digest("hex");
    

    if (expectedSignature === razorpay_signature) {
     

      // 3. Save the entry row into your Database Table
      await Donation.create({
        name,
        email,
        phone,
        amount: Number(amount), // force convert string numbers to clear integers
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        status: "success"
      });

      return res.status(200).json({ message: "Verified and Saved to Database!", success: true });
    } else {
      
      return res.status(400).json({
        message: "Invalid signature verification validation match",
        success: false,
        debug: { expected: expectedSignature, received: razorpay_signature }
      });
    }
  } catch (error) {
    console.error("Verification Pipeline Error Exception:", error);
    return res.status(500).json({ message: "Internal server verification pipeline crash", error: error.message });
  }
});

//Get all the payment Details of the user {who had donated all the amount to the church}  


//inserting all details of the users in the supabase database from the admin panel 


// Route to handle adding a new church member
// Endpoint matching the frontend fetch request link
router.post('/add-member', async (req, res) => {
  const { name, phone, churchBranch, isFavorite } = req.body;

  // 1. Input confirmation safety check
  if (!name || !phone || !churchBranch) {
    return res.status(400).json({
      success: false,
      message: 'Missing required member parameters.'
    });
  }

  try {
    // 2. 🛡️ DUPLICATE PHONE NUMBER CHECK
    // Query Supabase to find if any existing row shares this exact phone number
    const { data: existingMember, error: checkError } = await supabase
      .from('church_members')
      .select('phone_number')
      .eq('phone_number', phone)
      .maybeSingle(); // Returns null safely instead of throwing an error if no row is found

    if (checkError) {
      console.error('Supabase Look-up Error:', checkError.message);
      throw checkError;
    }

    // 3. If a record comes back, stop execution and return a clean error message
    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: `Phone number ${phone} is already registered to another church member.`
      });
    }

    // 4. Proceed with injection if the phone number is clear and unique
    const { data, error } = await supabase
      .from('church_members')
      .insert([
        {
          name: name,
          phone_number: phone,
          church_branch: churchBranch,
          is_favorite: isFavorite || false // Fallback to false if undefined
        }
      ])
      .select();

    if (error) throw error;

    // Send positive callback acknowledgement back to AddUser UI layout
    return res.status(200).json({
      success: true,
      message: 'Member recorded smoothly!',
      data: data
    });

  } catch (error) {
    console.error('Supabase DB Exception:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server failed to execute table entry.',
      errorDetails: error.message
    });
  }
});

// 1. Fetch only standard branch members (WHERE is_favorite = false)
router.get('/members/:branch', async (req, res) => {
  const { branch } = req.params;
  try {
    const { data, error } = await supabase
      .from('church_members')
      .select('*')
      .eq('church_branch', branch)
      .eq('is_favorite', false); // ◄ CRITICAL: Only brings back non-favorites!

    if (error) throw error;
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Fetch Error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Fetch ALL favorited members across all branches (WHERE is_favorite = true)
router.get('/favorites', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('church_members')
      .select('*')
      .eq('is_favorite', true); // ◄ CRITICAL: Grabs pinned favorites only!
    if (error) throw error;
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Favorites Fetch Error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Route to toggle a member's favorite status
router.patch('/members/toggle-favorite/:id', async (req, res) => {
  const { id } = req.params;
  const { currentStatus } = req.body; // Pass the current true/false value to flip it
  try {
    const { data, error } = await supabase
      .from('church_members')
      .update({ is_favorite: !currentStatus }) // Negates the state perfectly
      .eq('id', id)
      .select();
    if (error) throw error;
    return res.status(200).json({
      success: true,
      message: 'Favorite setting altered successfully!',
      data
    });
  } catch (error) {
    console.error('Toggle Route Error:', error.message);
    return res.status(500).json({ success: false, message: 'Database failed to alter status.' });
  }
});

// 1. Get the saved audio link configuration for a specific tab view segment
router.get('/settings/audio/:tabName', async (req, res) => {
  const { tabName } = req.params;
  try {
    const { data, error } = await supabase
      .from('campaign_settings')
      .select('audio_url')
      .eq('target_tab', tabName)
      .single(); // Grabs exactly one record match

    if (error && error.code !== 'PGRST116') throw error; // Ignore empty/no-match errors safely

    return res.status(200).json({
      success: true,
      audioUrl: data ? data.audio_url : ''
    });
  } catch (error) {
    console.error('Settings Get Failure:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Save or update a custom audio link configuration for a specific tab view segment
router.put('/settings/audio', async (req, res) => {
  const { tabName, audioUrl } = req.body;
  try {
    const { data, error } = await supabase
      .from('campaign_settings')
      .upsert({ target_tab: tabName, audio_url: audioUrl }, { onConflict: 'target_tab' })
      .select();

    if (error) throw error;
    return res.status(200).json({ success: true, message: 'Audio routing preference stored permanently!' });
  } catch (error) {
    console.error('Settings Put Failure:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/broadcast-voice', async (req, res) => {
  const { phoneNumbers,  audioUrl } = req.body;   
  

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid payload structure: phoneNumbers must be a non-empty array.' });
  }

  // Ensure there is at least something to communicate to the recipient
  if (!audioUrl) {
    return res.status(400).json({ success: false, message: 'Missing media source: Provide either an audioUrl file stream or text parameter.' });
  }

  try {
   // In your Backend Express Voice route file, update the map block:
    // ✅ NEW SANITIZATION SECTION (India, UK, & USA/Canada Support):
const sanitizedNumbers = phoneNumbers
  .map(num => {
    if (typeof num !== 'string') return null;
    let clean = num.trim().replace(/\D/g, '');

    // 1. Handle 10-digit entries
    if (clean.length === 10) {
      // US numbers can start with area codes 2 through 9. 
      // If it starts with 6, 7, 8, or 9, it's highly likely an Indian mobile number.
      if (/^[6-9]/.test(clean)) {
        return `+91${clean}`; // Fallback auto-route to India
      } else {
        return `+1${clean}`;  // Route to USA/Canada
      }
    } 
    
    // 2. Handle 11-digit entries (Clean USA format like 17163303008)
    if (clean.length === 11 && clean.startsWith('1')) {
      return `+${clean}`; // Becomes +17163303008
    }

    // 3. Handle 12-digit entries (Clean India +91 or UK +44 formats)
    if (clean.length === 12 && (clean.startsWith('91') || clean.startsWith('44'))) {
      return `+${clean}`; // Becomes +91XXXXXXXXXX or +44XXXXXXXXXX
    }
    
    return null;
  })
  .filter(num => num !== null);

   

   // Exit immediately if verification filters clean out all array targets
if (sanitizedNumbers.length === 0) {
  return res.status(400).json({ 
    success: false, 
    message: 'Security check failed: No valid Indian (+91), UK (+44), or US (+1) mobile numbers detected.' 
  });
}

    // 3. Construct Immutable TwiML Instruction Payloads
    // This dynamically determines if Twilio plays a raw MP3/WAV or triggers a Text-to-Speech Engine
    let twimlPayload = '';
    if (audioUrl) {
      // Validate string to protect against raw command injection attacks
      const secureUrl = encodeURI(audioUrl.trim());
      twimlPayload = `<Response><Play>${secureUrl}</Play></Response>`;
    } 


    // 4. Fire Async Telephony Dispatches in Parallel
    const deliveryQueue = sanitizedNumbers.map(targetNumber => {
      // 1. Grab your live URL, defaulting to a hardcoded backup string if things glitch out
      const rawBaseUrl = process.env.SERVER_URL || 'https://razorpay-ia3u.onrender.com';
      
      // 2. Erase any trailing slash completely to stop double slash '//' validation errors
      const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '');
      
      // 3. FIX THE TYPO: Explicitly target the routing path your webhook is listening on!
      const finalCallbackUrl = `${cleanBaseUrl}/twilio-voice-callback`;


      return client.calls.create({
        twiml: `<Response><Play>${audioUrl}</Play></Response>`,
        to: targetNumber,
        from: twilioCallerId,
        asyncAmd: 'Enable',
        
        // ✅ Pristine, error-proof configuration setup
        statusCallback: finalCallbackUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'completed'],
        statusCallbackMethod: 'POST'
      });
    });

    const executionResults = await Promise.allSettled(deliveryQueue);

    // 5. Parse operational responses for backend transparency logs & 🔥 UPDATE SUPABASE
    const summary = executionResults.reduce((acc, result, idx) => {
      const currentNumber = sanitizedNumbers[idx];
      // Strip out the '+' to match your database column format
      const dbLookupNumber = currentNumber.replace('+', '');
      if (result.status === 'fulfilled') {   
        acc.successes.push({ number: currentNumber, sid: result.value.sid });

        // 🔥 FIRE-AND-FORGET UPDATE: Log the successful initial Twilio handover (e.g. "queued" or "initiated")
        supabase
          .from('church_members')
          .update({ 
            last_call_status: result.value.status || 'queued', 
            last_call_duration: 0 
          })
          .eq('phone_number', dbLookupNumber)
          .then(({ error }) => {
            if (error) console.error(`⚠️ Database Sync Error for ${currentNumber}:`, error.message);
          });

      } else {
        acc.failures.push({ number: currentNumber, error: result.reason.message });

        // 🔥 FIRE-AND-FORGET UPDATE: If Twilio dropped it instantly (e.g. unverified), log the failure state
        supabase
          .from('church_members')
          .update({ 
            last_call_status: 'failed', 
            last_call_duration: 0 
          })
          .eq('phone_number', dbLookupNumber)
          .then(({ error }) => {
            if (error) console.error(`⚠️ Database Sync Error for ${currentNumber}:`, error.message);
          });
      }
      return acc;
    }, { successes: [], failures: [] });

    // 6. Return response payload layout back to the React UI system  
    return res.status(200).json({
      success: summary.failures.length === 0,
      message: `Telephony execution completed. Successes: ${summary.successes.length}, Failures: ${summary.failures.length}`,
      data: summary
    });

  } catch (globalError) {
    console.error("🚨 CRITICAL TELEPHONY SYSTEM FAULT:", globalError.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Application Server failed to negotiate processing payload with Twilio infrastructure.',
      error: globalError.message
    });
  }
});

// 🚀 BACKEND ROUTE: Cleanly remove a member from the database
router.delete('/delete-user/:id', async (req, res) => {
  const { id } = req.params; // Grabs the unique ID straight from the URL path

  if (!id) {
    return res.status(400).json({ success: false, message: 'Missing parameters: Unique identifier required.' });
  }

  try {
    // Execute a clean target deletion from your Supabase table
    const { data, error } = await supabase
      .from('church_members')
      .delete()
      .eq('id', id); // 👈 Or use .eq('phone_number', id) if you look up by phone number

    if (error) throw error;

    return res.status(200).json({ 
      success: true, 
      message: 'Member removed from the database permanently!' 
    });

  } catch (error) {
    console.error('🚨 Admin Delete Operation Failure:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to purge record from infrastructure: ' + error.message 
    });
  }
});
module.exports = router;