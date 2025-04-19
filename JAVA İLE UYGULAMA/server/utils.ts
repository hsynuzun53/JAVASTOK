import * as bcryptjs from "bcrypt";
import exceljs from "exceljs";
import type { ProductWithInventory } from "@shared/schema";

export const bcrypt = bcryptjs;

export async function generateExcel(
  data: ProductWithInventory[],
  startDate: string,
  endDate: string
): Promise<exceljs.Workbook> {
  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet("Envanter Raporu");

  worksheet.columns = [
    { header: "Ürün ID", key: "id", width: 10 },
    { header: "Ürün Adı", key: "name", width: 30 },
    { header: "Kategori", key: "category", width: 20 },
    { header: "Miktar", key: "current_quantity", width: 15 },
    { header: "Birim", key: "unit", width: 15 },
    { header: "Toplam Değer (TL)", key: "total_value", width: 20 },
    { header: "Hareket Sayısı", key: "movement_count", width: 20 },
  ];

  // Başlık stilini ayarla
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  // Verileri ekle
  data.forEach((item) => {
    worksheet.addRow({
      id: item.id,
      name: item.name,
      category: item.category,
      current_quantity: item.current_quantity,
      unit: item.unit,
      total_value: item.total_value,
      movement_count: item.movement_count,
    });
  });

  // Rapor başlığı ekle
  worksheet.insertRow(1, [
    `Envanter Raporu (${startDate} - ${endDate})`,
  ]);
  worksheet.getRow(1).font = { bold: true, size: 16 };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  worksheet.mergeCells("A1:G1");

  // Sayı formatlarını ayarla
  worksheet.getColumn("D").numFmt = "#,##0.00";
  worksheet.getColumn("F").numFmt = "#,##0.00 TL";

  return workbook;
}