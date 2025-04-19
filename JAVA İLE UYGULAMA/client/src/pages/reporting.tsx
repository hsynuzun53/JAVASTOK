import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { PageTitle } from "@/components/page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, FileText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const reportSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

type ReportFormValues = z.infer<typeof reportSchema>;

export default function Reporting() {
  const { user } = useAuth();
  const [reportParams, setReportParams] = useState({
    startDate: "",
    endDate: "",
  });
  const [activeTab, setActiveTab] = useState("detailed"); // Added state for active tab

  // Form setup
  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      startDate: "",
      endDate: "",
    },
  });

  // Fetch inventory report
  const { data: report, isLoading: isLoadingReport } = useQuery({
    queryKey: ["/api/reports/inventory", reportParams.startDate, reportParams.endDate],
    queryFn: async () => {
      let url = "/api/reports/inventory";
      if (reportParams.startDate || reportParams.endDate) {
        url += "?";
        if (reportParams.startDate) url += `startDate=${reportParams.startDate}`;
        if (reportParams.startDate && reportParams.endDate) url += "&";
        if (reportParams.endDate) url += `endDate=${reportParams.endDate}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Error fetching report");
      return res.json();
    },
    enabled: !!user && (user.can_view_reports || user.is_admin),
  });

  const onSubmit = (data: ReportFormValues) => {
    setReportParams({
      startDate: data.startDate,
      endDate: data.endDate,
    });

    // Veriyi yenilemek için sorguyu sıfırla
    queryClient.invalidateQueries({ 
      queryKey: ["/api/reports/inventory", data.startDate, data.endDate] 
    });
  };

  const handleExportToExcel = (reportType: string) => {
    let url = `/api/reports/export/${reportType}`;
    if (reportParams.startDate || reportParams.endDate) {
      url += "?";
      if (reportParams.startDate) url += `startDate=${reportParams.startDate}`;
      if (reportParams.startDate && reportParams.endDate) url += "&";
      if (reportParams.endDate) url += `endDate=${reportParams.endDate}`;
    }

    // Use fetch to handle the download
    fetch(url, {
      method: 'GET',
      credentials: 'include'
    })
    .then(response => response.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reportType === 'detailed' ? 'detayli_stok_raporu.xlsx' : 'ozet_stok_raporu.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    })
    .catch(error => {
      console.error('Excel indirme hatası:', error);
    });
  };

  return (
    <div>
      <PageTitle title="Stok ve Değer Raporu" />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Başlangıç Tarihi</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bitiş Tarihi</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  type="submit" 
                  disabled={!user?.can_view_reports && !user?.is_admin}
                >
                  Raporu Oluştur
                </Button>

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleExportToExcel(activeTab)} // Modified onClick to pass activeTab
                  disabled={!report || (!user?.can_view_reports && !user?.is_admin)}
                >
                  <FileText className="h-4 w-4 mr-2" /> {activeTab === "detailed" ? "Detaylı Raporu" : "Özet Raporu"} Excel'e Aktar
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="detailed" onValueChange={setActiveTab}> {/* Added onValueChange */}
            <TabsList>
              <TabsTrigger value="detailed">Detaylı Rapor</TabsTrigger>
              <TabsTrigger value="summary">Özet Rapor</TabsTrigger>
            </TabsList>

            <TabsContent value="detailed">
              <h3 className="text-lg font-medium mb-4">Detaylı Stok Raporu</h3>
              {isLoadingReport ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : report && report.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Tarih</TableHead>
                        <TableHead className="whitespace-nowrap">Ürün Adı</TableHead>
                        <TableHead className="whitespace-nowrap">Kategori</TableHead>
                        <TableHead className="whitespace-nowrap">Miktar</TableHead>
                        <TableHead className="whitespace-nowrap">Birim</TableHead>
                        <TableHead className="whitespace-nowrap">Birim Fiyat (TL)</TableHead>
                        <TableHead className="whitespace-nowrap">Toplam Değer (TL)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report
                        .sort((a: any, b: any) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime())
                        .map((item: any) => {
                          const unitPrice = item.total_price && item.quantity_change 
                            ? (item.total_price / Math.abs(item.quantity_change)).toFixed(2) 
                            : '0.00';

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">
                                {new Date(item.movement_date).toLocaleDateString('tr-TR')}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{item.product_name}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.product_category}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.quantity_change?.toFixed(2)}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.unit}</TableCell>
                              <TableCell className="whitespace-nowrap">{unitPrice}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.total_price?.toFixed(2)}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  Rapor verisi bulunamadı
                </div>
              )}
            </TabsContent>

            <TabsContent value="summary">
              <h3 className="text-lg font-medium mb-4">Özet Rapor</h3>
              {isLoadingReport ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : report && report.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <h4 className="text-sm font-medium mb-2">Toplam Stok Değeri</h4>
                        <p className="text-2xl font-bold">
                          {report.reduce((sum, item) => sum + (item.total_price || 0), 0).toFixed(2)} TL
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <h4 className="text-sm font-medium mb-2">Toplam Miktar</h4>
                        <p className="text-2xl font-bold">
                          {report.reduce((sum, item) => sum + Math.abs(item.quantity_change || 0), 0).toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Ürün Adı</TableHead>
                          <TableHead className="whitespace-nowrap">Miktar</TableHead>
                          <TableHead className="whitespace-nowrap">Birim</TableHead>
                          <TableHead className="whitespace-nowrap">Birim Fiyat (TL)</TableHead>
                          <TableHead className="whitespace-nowrap">Toplam Değer (TL)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(
                          report.reduce((acc: any, item: any) => {
                            const key = item.product_name;
                            if (!acc[key]) {
                              acc[key] = {
                                name: item.product_name,
                                quantity: 0,
                                unit: item.unit,
                                total_price: 0
                              };
                            }
                            acc[key].quantity += Math.abs(item.quantity_change || 0);
                            acc[key].total_price += item.total_price || 0;
                            return acc;
                          }, {})
                        ).map(([key, item]: [string, any]) => {
                          const unitPrice = item.quantity > 0 
                            ? (item.total_price / item.quantity).toFixed(2) 
                            : '0.00';

                          return (
                            <TableRow key={key}>
                              <TableCell className="whitespace-nowrap">{item.name}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.quantity.toFixed(2)}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.unit}</TableCell>
                              <TableCell className="whitespace-nowrap">{unitPrice}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.total_price.toFixed(2)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  Rapor verisi bulunamadı
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}