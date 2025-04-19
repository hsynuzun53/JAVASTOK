import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/sidebar";
import StockManagement from "@/pages/stock-management";
import ProductDefinition from "@/pages/product-definition";
import Reporting from "@/pages/reporting";
import UserManagement from "@/pages/user-management";

export default function HomePage() {
  const { user } = useAuth();
  const [activePage, setActivePage] = useState(() => {
    // Set default page based on user permissions
    if (user?.can_manage_inventory) return "stock-management";
    if (user?.can_add_product) return "product-definition";
    if (user?.can_view_reports) return "reporting";
    if (user?.is_admin) return "user-management";
    return "stock-management"; // Fallback
  });
  
  // Render active page component
  const renderActivePage = () => {
    switch(activePage) {
      case "stock-management":
        return <StockManagement />;
      case "product-definition":
        return <ProductDefinition />;
      case "reporting":
        return <Reporting />;
      case "user-management":
        return <UserManagement />;
      default:
        return <div>Sayfa bulunamadı</div>;
    }
  };

  return (
    <div className="flex w-full min-h-screen bg-gray-50">
      <Sidebar activePage={activePage} onPageChange={setActivePage} />
      <main className="flex-1 p-6">
        {renderActivePage()}
      </main>
    </div>
  );
}
