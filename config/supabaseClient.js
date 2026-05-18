const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// These variables will be pulled from your .env locally 
// and from "Environment Variables" on Render
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Anon Key is missing! Check your environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = supabase;