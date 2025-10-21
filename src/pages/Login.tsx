"use client";

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useSupabase } from '@/components/SessionContextProvider';
// Removed useNavigate and useEffect as redirection is now handled in App.tsx

const Login = () => {
  const { supabase } = useSupabase(); // Removed session as it's not needed for redirection here

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">Sign In / Sign Up</h2>
        <Auth
          supabaseClient={supabase}
          providers={[]} // You can add 'google', 'github', etc. here if desired
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(var(--primary))',
                  brandAccent: 'hsl(var(--primary-foreground))',
                },
              },
            },
          }}
          theme="light" // Or "dark" based on your app's theme
          redirectTo={window.location.origin + '/game'} {/* Redirect to /game */}
        />
      </div>
    </div>
  );
};

export default Login;