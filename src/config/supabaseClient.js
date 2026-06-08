import { createClient } from '@supabase/supabase-js';

// Leemos las variables de entorno que configuramos en el Paso 1
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializamos el cliente para poder usarlo en toda la app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);