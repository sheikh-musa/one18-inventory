import React, { useState, useEffect } from "react";
import InventoryPanel from "./components/InventoryPanel";
import Auth from "./components/Auth";
import { Toaster } from "@/components/ui/toaster";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const authStatus = localStorage.getItem("isAuthenticated");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    setIsAuthenticated(false);
  };

  return (
    <div className="container mx-auto p-4">
      {isAuthenticated ? (
        <>
          <button onClick={handleLogout} className="mb-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Logout
          </button>
          <InventoryPanel />
        </>
      ) : (
        <Auth onLogin={handleLogin} />
      )}
      <Toaster />
    </div>
  );
}

export default App;
