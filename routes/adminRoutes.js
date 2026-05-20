const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');      
const crypto = require("crypto");
const Razorpay = require("razorpay");
const supabase = require('../config/supabaseClient'); // Double check your path to config   


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

router.delete("/events/:id",async(req,res)=>{
     try{
         const {id} = req.params; 
         const deleted = await Event.destroy({
           where:{id:id}
         })      
          if (deleted) {
      // 204 No Content is also a good professional status for a successful delete
      res.status(200).json({ message: "Event deleted successfully" });
    } else {
      res.status(404).json({ message: "Event not found" });
    }
     }   
     catch(err){
        console.error("Delete Error:", err);
       res.status(500).json({ error: "Internal Server Error" });
     }
})


// --- SERMON ROUTES ---    
router.put("/sermon/:id",async(req,res)=>{
     try{
         const {id} = req.params;    
         const {title,youtube_url,description} = req.body;
         const sermonItem = await Sermon.findByPk(id); 
         if(!sermonItem){
           return res.status(404).json({ message: "Not found" });
         }        
        await sermonItem.update({
            title,youtube_url,description
         })   
         res.json(sermonItem) 
     }  
     catch(err){
         res.status(500).json({ message: "Update failed", error: err.message });
     }
})

router.get("/sermon", async (req, res) => {   
  try{
     
  
  const data = await Sermon.findAll({ order: [['createdAt', 'DESC']] });
  res.json(data);   
  }  
  catch(err){
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
 
router.delete("/sermon/:id",async(req,res)=>{
      try{
          const {id} = req.params; 
          const deleted = await Sermon.destroy({
             where:{id:id}
          })   
          if(deleted){
               res.status(200).json({ message: "Sermon deleted successfully" });
          }  
          else{
               res.status(404).json({ message: "Sermon was not found" });
          }
      }  
      catch(err){
          res.status(500).json({ error: "Sermon Server Error" });
      }
})
// --- GALLERY ROUTES ---
router.get("/gallery", async (req, res) => {
  try{
  const data = await Gallery.findAll({ order: [['createdAt', 'DESC']] });
  res.json(data);    
  }
  catch(err){
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
  console.log("hiiii")
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
  console.log("=== INCOMING VERIFICATION PAYLOAD ===", req.body);
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      name, email, phone, amount 
    } = req.body;

    // 1. Double check that critical signature segments exist
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log("Missing core tracking parameters!");
      return res.status(400).json({ message: "Missing tracking signature parameters", success: false });
    }

    // 2. Generate the local cryptographic signature matching Razorpay rules
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET.trim()) // added .trim() to wipe out hidden spaces!
      .update(body.toString())
      .digest("hex");
    console.log("Expected Hash:", expectedSignature);
    console.log("Received Hash:", razorpay_signature);

    if (expectedSignature === razorpay_signature) {
      console.log("✅ HASHES MATCH! Writing entry row to records storage...");
      
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
      console.log("❌ CRITICAL HASH MATCH MISMATCH!");
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
module.exports = router;