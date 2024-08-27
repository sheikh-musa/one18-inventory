import React, { useState } from "react";
import InventoryPanel from "./components/InventoryPanel";
import Auth from "./components/Auth";
import { Toaster } from "@/components/ui/toaster";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <div className="container mx-auto p-4">
      {isAuthenticated ? <InventoryPanel /> : <Auth onLogin={() => setIsAuthenticated(true)} />}
      <Toaster />
    </div>
  );
}

export default App;
