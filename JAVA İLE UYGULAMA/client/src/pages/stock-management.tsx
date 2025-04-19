import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageTitle } from "@/components/page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

const inventoryMovementSchema = z.object({
  product_id: z.string().min(1, "Ürün seçilmelidir"),
  quantity: z.coerce.number().min(0.01, "Miktar 0'dan büyük olmalıdır"),
  unit: z.string().min(1, "Birim seçilmelidir"),
  total_price: z.coerce.number().min(0, "Fiyat 0 veya daha büyük olmalıdır"),
});

type InventoryMovementFormValues = z.infer<typeof inventoryMovementSchema>;

export default function StockManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);

  // Fetch latest movements
  const { data: movementsData, isLoading: isLoadingMovements } = useQuery({
    queryKey: ["/api/inventory/movements/latest", startDate, endDate],
    queryFn: async () => {
      let url = "/api/inventory/movements/latest?limit=20";
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error fetching movements");
      return res.json();
    },
    enabled: !!user,
  });

  // Tarihe göre hareketleri filtrele
  const filteredMovements = movementsData?.filter((movement: any) => {
    const movementDate = new Date(movement.movement_date);
    return movementDate >= new Date(startDate) && movementDate <= new Date(endDate + 'T23:59:59');
  });

  // Form setup
  const form = useForm<InventoryMovementFormValues>({
    resolver: zodResolver(inventoryMovementSchema),
    defaultValues: {
      product_id: "",
      quantity: 0,
      unit: "kg",
      total_price: 0,
    },
  });

  // Fetch products
  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["/api/products"],
    enabled: !!user,
  });


  // Add inventory movement mutation
  const addMovementMutation = useMutation({
    mutationFn: async (data: InventoryMovementFormValues) => {
      const parsedData = {
        product_id: parseInt(data.product_id),
        quantity_change: data.quantity,
        unit: data.unit,
        total_price: data.total_price,
      };
      console.log("Sending data:", parsedData);
      return apiRequest("POST", "/api/inventory/movements", parsedData);
    },
    onSuccess: async () => {
      toast({
        title: "Başarılı",
        description: "Stok hareketi başarıyla eklendi",
      });
      form.reset();

      // Tüm verileri hemen güncelle
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements/latest"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/reports/inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/products"] })
      ]).then(() => {
        queryClient.refetchQueries({ type: "active", exact: false });
      });

      // Force refetch all queries
      queryClient.resetQueries();
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: `Stok hareketi eklenirken bir hata oluştu: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Delete movement mutation
  const deleteMovementMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/inventory/movements/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Başarılı",
        description: "Stok hareketi başarıyla silindi",
      });
      // Stok hareketlerini ve raporları güncelle
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/inventory"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: `Stok hareketi silinirken bir hata oluştu: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InventoryMovementFormValues) => {
    addMovementMutation.mutate(data);
  };

  return (
    <div>
      <PageTitle title="Stok Güncelleme" />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Ürün</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? products?.find(
                                  (product: any) => product.id.toString() === field.value
                                )?.name
                              : "Ürün Seçiniz"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Ürün arayın..."
                            className="h-9"
                          />
                          <CommandEmpty>Ürün bulunamadı</CommandEmpty>
                          <CommandGroup>
                            {isLoadingProducts ? (
                              <div className="flex justify-center p-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            ) : (
                              products?.map((product: any) => (
                                <CommandItem
                                  value={product.name}
                                  key={product.id}
                                  onSelect={() => {
                                    form.setValue("product_id", product.id.toString());
                                  }}
                                  className="flex items-center justify-between"
                                >
                                  <div>
                                    <span>{product.name}</span>
                                    <span className="ml-2 text-sm text-muted-foreground">
                                      ({product.category})
                                    </span>
                                  </div>
                                  {product.id.toString() === field.value && (
                                    <Check className="h-4 w-4" />
                                  )}
                                </CommandItem>
                              ))
                            )}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Miktar</FormLabel>
                      <FormControl>
                        <Input type="number" min="0.1" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Birim</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Birim Seçiniz" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="litre">litre</SelectItem>
                          <SelectItem value="adet">adet</SelectItem>
                          <SelectItem value="gram">gram</SelectItem>
                          <SelectItem value="paket">paket</SelectItem>
                          <SelectItem value="kova">kova</SelectItem>
                          <SelectItem value="ml">ml</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="total_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Toplam Fiyat (TL)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full sm:w-auto" 
                disabled={addMovementMutation.isPending}
              >
                {addMovementMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ÜRÜN GİRİLİYOR...
                  </>
                ) : (
                  "ÜRÜN GİR"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <h2 className="text-xl font-semibold mb-4">Son Eklenen Ürünler</h2>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="filterStartDate" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Başlangıç Tarihi
              </label>
              <Input 
                id="filterStartDate" 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
              />
            </div>
            <div>
              <label htmlFor="filterEndDate" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Bitiş Tarihi
              </label>
              <Input 
                id="filterEndDate" 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
              />
            </div>
            <div className="md:pt-7">
              <Button 
                type="button" 
                variant="secondary"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements/latest", startDate, endDate] });
                }}
              >
                Filtrele
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="max-h-[400px] overflow-y-auto divide-y">
            {isLoadingMovements ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredMovements?.length > 0 ? (
              filteredMovements.map((movement: any) => (
                <div key={movement.id} className="py-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <h4 className="font-medium">{movement.product_name}</h4>
                      <p className="text-sm text-gray-600">Bölüm: {movement.product_category}</p>
                    </div>
                    <div>
                      <p className="text-sm">Tarih: {new Date(movement.movement_date).toLocaleString()}</p>
                      <p className="text-sm">Miktar: {movement.quantity_change} {movement.unit}</p>
                      <p className="text-sm">Toplam: {movement.total_price.toFixed(2)} TL</p>
                    </div>
                  </div>
                  {(user?.is_admin || user?.can_manage_inventory) && (
                    <div className="mt-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" /> Hareketi Sil
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Stok hareketini silmek istediğinize emin misiniz?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Bu işlem geri alınamaz. Bu stok hareketi sistemden kalıcı olarak silinecektir.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>İptal</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMovementMutation.mutate(movement.id)}
                              disabled={deleteMovementMutation.isPending}
                            >
                              {deleteMovementMutation.isPending ? (
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
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500">
                Seçilen tarih aralığında stok hareketi bulunamadı
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}