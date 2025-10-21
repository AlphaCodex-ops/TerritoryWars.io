import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import GamePage from "./pages/GamePage";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import HomePage from "./pages/HomePage"; // Import the new HomePage
import { SessionContextProvider, useSupabase } from "./components/SessionContextProvider";
import React from "react";

const queryClient = new QueryClient();

// PrivateRoute component to protect routes
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useSupabase();
  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading authentication...</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AppContent = () => {
  const { session, loading } = useSupabase();

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading authentication...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} /> {/* Home page at root */}
        <Route path="/login" element={session ? <Navigate to="/game" replace /> : <Login />} /> {/* Redirect to /game after login */}
        <Route path="/game" element={<PrivateRoute><GamePage /></PrivateRoute>} /> {/* Game page is now protected at /game */}
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessionContextProvider>
        <AppContent />
      </SessionContextProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;