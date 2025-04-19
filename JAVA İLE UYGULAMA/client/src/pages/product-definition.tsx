import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageTitle } from "@/components/page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const productSchema = z.object({
  name: z.string().min(1, "Ürün adı gerekli"),
  category: z.string().min(1, "Bölüm seçilmelidir"),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function ProductDefinition() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Form setup
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      category: "GENEL",
    },
  });
  
  // Fetch products
  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["/api/products"],
    enabled: !!user,
  });
  
  // Add product mutation
  const addProductMutation = useMutation({
    mutationFn: async (data: ProductFormValues) => {
      const res = await apiRequest("POST", "/api/products", data);
      return await res.json();
    },
    onSuccess: async () => {
      toast({
        title: "Başarılı",
        description: "Ürün başarıyla eklendi",
      });
      form.reset();
      
      // Tüm verileri hemen güncelle
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements/latest"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/reports/inventory"] })
      ]).then(() => {
        queryClient.refetchQueries({ type: "active", exact: false });
      });
      
      // Force refetch all queries
      queryClient.resetQueries();
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: `Ürün eklenirken bir hata oluştu: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Ürün başarıyla silindi",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: `Ürün silinirken bir hata oluştu: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: ProductFormValues) => {
    addProductMutation.mutate(data);
  };
  
  // Group products by category
  const productsByCategory: Record<string, any[]> = {};
  
  if (products) {
    products.forEach((product: any) => {
      if (!productsByCategory[product.category]) {
        productsByCategory[product.category] = [];
      }
      productsByCategory[product.category].push(product);
    });
  }
  
  return (
    <div>
      <PageTitle title="Ürün Tanımlama" />
      
      <Card className="mb-6">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ürün Adı</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ürün Bölümü</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Bölüm Seçiniz" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="TEMİZLİK">TEMİZLİK</SelectItem>
                        <SelectItem value="BAR">BAR</SelectItem>
                        <SelectItem value="MUTFAK">MUTFAK</SelectItem>
                        <SelectItem value="İÇECEK">İÇECEK</SelectItem>
                        <SelectItem value="PASTA">PASTA</SelectItem>
                        <SelectItem value="DONDURMA">DONDURMA</SelectItem>
                        <SelectItem value="GENEL">GENEL</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button 
                type="submit" 
                disabled={addProductMutation.isPending || !user?.can_add_product && !user?.is_admin}
              >
                {addProductMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ekleniyor...
                  </>
                ) : (
                  "Ürün Ekle"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <h2 className="text-xl font-semibold mb-4">Tanımlı Ürünler</h2>
      
      {isLoadingProducts ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : Object.keys(productsByCategory).length > 0 ? (
        Object.entries(productsByCategory).map(([category, categoryProducts]) => (
          <div key={category} className="mb-6">
            <h3 className="text-lg font-medium mb-2">{category}</h3>
            <Card>
              <CardContent className="p-0 divide-y">
                {categoryProducts.map((product: any) => (
                  <div 
                    key={product.id} 
                    className="p-4 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-medium">{product.name}</h4>
                      <p className="text-sm text-gray-600">Bölüm: {product.category}</p>
                    </div>
                    
                    {(user?.is_admin || user?.can_add_product) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" /> Sil
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Ürünü silmek istediğinize emin misiniz?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Bu işlem geri alınamaz. Bu ürün ve ilişkili tüm stok hareketleri sistemden silinecektir.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>İptal</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteProductMutation.mutate(product.id)}
                              disabled={deleteProductMutation.isPending}
                            >
                              {deleteProductMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Siliniyor...
                                </>
                              ) : (
                                "Sil"
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ))
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            Tanımlı ürün bulunamadı
          </CardContent>
        </Card>
      )}
    </div>
  );
}
