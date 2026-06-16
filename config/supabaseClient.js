const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
// THE FIX: Switch from ANON_KEY to the master SERVICE_ROLE_KEY
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Service Role Key is missing! Check your .env configuration.");
}

// This client will now securely bypass all RLS walls on your Node server!
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

module.exports = supabase;