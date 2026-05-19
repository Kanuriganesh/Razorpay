const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');   
const supabase = require('../config/supabaseClient'); // Double check your path to config

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

// POST: Upload a new gallery photo
router.post("/gallery", upload.single('image'), async (req, res) => {   
  try {
    // 1. Multer checks if a file was actually sent
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an image file" });
    }

    // 2. Create the URL path to save in the database
    const gallery_url = `/uploads/${req.file.filename}`;

    // 3. Save to SQLite
    const galleryItem = await Gallery.create({ gallery_url }); 
    
    res.status(201).json(galleryItem);
  } catch (error) {
    console.error("POST Gallery Error:", error);
    res.status(500).json({ message: "Error uploading to gallery", error: error.message });
  }
});

// PUT: Update an existing gallery photo
router.put("/gallery/:id", upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const galleryItem = await Gallery.findByPk(id);

    if (!galleryItem) {
      return res.status(404).json({ message: "Image not found" });
    }

    // Only update the path if a NEW file was uploaded
    if (req.file) {
      const newPath = `/uploads/${req.file.filename}`;
      await galleryItem.update({ gallery_url: newPath });
    }

    res.json(galleryItem);
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

router.delete("/gallery/:id",async(req,res)=>{
      try{
          const {id} = req.params; 
          const deleted = await Gallery.destroy({
             where:{id:id}
          })   
          if(deleted){
               res.status(200).json({ message: "Gallery deleted successfully" });
          }  
          else{
               res.status(404).json({ message: "Gallery was not found" });
          }
      }  
      catch(err){
          res.status(500).json({ error: "Gallery Server Error" });
      }
})

//Get all the payment Details of the user {who had donated all the amount to the church}   
module.exports = router;