const SUPABASE_URL="https://yhbqnnwqpmwrealftejl.supabase.co";
const SUPABASE_KEY="sb_publishable_pGEWEgVoIJRhyMxJV7wyog_Sazd22l3";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
