import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, BarChart2, Package, FileText, Users } from "lucide-react";

type SidebarItem = {
  id: string;
  name: string;
  icon: React.ReactNode;
  permission?: keyof Pick<User, "is_admin" | "can_add_product" | "can_view_reports" | "can_manage_inventory">;
};

type SidebarProps = {
  activePage: string;
  onPageChange: (page: string) => void;
};

export function Sidebar({ activePage, onPageChange }: SidebarProps) {
  const { user, logoutMutation } = useAuth();
  const [_, setLocation] = useLocation();
  
  const menuItems: SidebarItem[] = [
    {
      id: "stock-management",
      name: "Stok Ekle/Düzenle",
      icon: <Package className="h-5 w-5 mr-2" />,
      permission: "can_manage_inventory"
    },
    {
      id: "product-definition",
      name: "Ürün Tanımlama",
      icon: <Package className="h-5 w-5 mr-2" />,
      permission: "can_add_product"
    },
    {
      id: "reporting",
      name: "Raporlama",
      icon: <BarChart2 className="h-5 w-5 mr-2" />,
      permission: "can_view_reports"
    },
    {
      id: "user-management",
      name: "Kullanıcı Yönetimi",
      icon: <Users className="h-5 w-5 mr-2" />,
      permission: "is_admin"
    }
  ];
  
  // Filter menu items based on user permissions
  const filteredMenuItems = menuItems.filter(item => {
    if (!item.permission) return true;
    return user && user[item.permission];
  });
  
  const handleLogout = () => {
    logoutMutation.mutate();
    setLocation("/auth");
  };
  
  return (
    <div className="w-64 bg-white shadow-md min-h-screen p-4 flex flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-primary-500">Stok Takip Sistemi</h2>
        <p className="text-sm text-gray-600">Hoş Geldiniz, {user?.username}!</p>
      </div>
      
      <nav className="flex-1">
        <ul className="space-y-2">
          {filteredMenuItems.map((item) => (
            <li key={item.id}>
              <Button
                variant={activePage === item.id ? "default" : "ghost"}
                className={`w-full justify-start`}
                onClick={() => onPageChange(item.id)}
              >
                {item.icon}
                {item.name}
              </Button>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="mt-6">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-gray-700"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? (
            "Çıkış yapılıyor..."
          ) : (
            <>
              <LogOut className="h-5 w-5 mr-2" />
              Çıkış Yap
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
