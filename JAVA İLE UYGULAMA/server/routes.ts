import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { generateExcel } from "./utils";
import bcrypt from "bcrypt";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Product routes
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Error fetching products" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      // Check if user has permission
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.can_add_product && !user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const existingProduct = await storage.getProductByName(req.body.name);
      if (existingProduct) {
        return res.status(400).json({ message: "Bu ürün zaten tanımlı" });
      }

      const product = await storage.createProduct({
        name: req.body.name,
        category: req.body.category
      });
      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({ message: "Error creating product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      // Check if user has permission
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.can_add_product && !user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const id = parseInt(req.params.id);
      const success = await storage.deleteProduct(id);
      if (success) {
        res.status(200).json({ message: "Ürün başarıyla silindi" });
      } else {
        res.status(404).json({ message: "Ürün bulunamadı" });
      }
    } catch (error) {
      res.status(500).json({ message: "Error deleting product" });
    }
  });

  // Inventory routes
  app.get("/api/inventory", async (req, res) => {
    try {
      const inventory = await storage.getAllInventory();

      // Enhance inventory with product details
      const enhancedInventory = await Promise.all(inventory.map(async (item) => {
        const product = await storage.getProduct(item.product_id);
        return {
          ...item,
          product_name: product?.name,
          product_category: product?.category
        };
      }));

      res.json(enhancedInventory);
    } catch (error) {
      res.status(500).json({ message: "Error fetching inventory" });
    }
  });

  // Inventory movement routes
  app.post("/api/inventory/movements", async (req, res) => {
    try {
      // Check if user has permission
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.can_manage_inventory && !user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const { product_id, quantity_change, unit, total_price } = req.body;

      console.log("Received data:", req.body);

      if (!product_id || !quantity_change || !unit || total_price === undefined) {
        return res.status(400).json({ message: "Lütfen tüm alanları doldurun" });
      }

      // Create movement record
      const movement = await storage.createInventoryMovement({
        product_id: parseInt(product_id),
        quantity_change: parseFloat(quantity_change),
        unit,
        total_price: parseFloat(total_price),
        movement_type: "update",
        user_id: user.id,
        movement_date: new Date()
      });

      // Update inventory
      await storage.updateInventory({
        product_id: parseInt(product_id),
        quantity: parseFloat(quantity_change),
        unit,
        total_price: parseFloat(total_price),
        updated_by: user.id,
        last_updated: new Date()
      });

      res.status(201).json(movement);
    } catch (error) {
      res.status(500).json({ message: "Error creating inventory movement" });
    }
  });

  app.get("/api/inventory/movements/latest", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const movements = await storage.getLatestInventoryMovements(limit);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ message: "Error fetching inventory movements" });
    }
  });

  app.delete("/api/inventory/movements/:id", async (req, res) => {
    try {
      // Check if user has permission
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.can_manage_inventory && !user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const id = parseInt(req.params.id);
      const success = await storage.deleteInventoryMovement(id);
      if (success) {
        res.status(200).json({ message: "Stok hareketi başarıyla silindi" });
      } else {
        res.status(404).json({ message: "Stok hareketi bulunamadı" });
      }
    } catch (error) {
      res.status(500).json({ message: "Error deleting inventory movement" });
    }
  });

  // Report routes
  app.get("/api/reports/inventory", async (req, res) => {
    try {
      // Check if user has permission
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.can_view_reports && !user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      // Varsayılan değerleri ayarla
      const today = new Date();
      let startDate = req.query.startDate as string || new Date(0).toISOString();
      let endDate = req.query.endDate as string || today.toISOString();

      // Tarih formatını kontrol et
      if (startDate && !startDate.includes('T')) {
        // Sadece YYYY-MM-DD formatında ise
        startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString();
      }

      if (endDate && !endDate.includes('T')) {
        // Sadece YYYY-MM-DD formatında ise
        // Bitiş tarihini günün sonuna ayarla
        endDate = new Date(`${endDate}T23:59:59.999Z`).toISOString();
      }

      const movements = await storage.getDetailedMovementsReport(startDate, endDate);
      res.json(movements);
    } catch (error) {
      console.error("Report generation error:", error);
      res.status(500).json({ message: "Rapor oluşturulurken bir hata oluştu" });
    }
  });

  app.get("/api/reports/movements", async (req, res) => {
    try {
      // Check if user has permission
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.can_view_reports && !user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      // Varsayılan değerleri ayarla
      const today = new Date();
      let startDate = req.query.startDate as string || new Date(0).toISOString();
      let endDate = req.query.endDate as string || today.toISOString();

      // Tarih formatını kontrol et
      if (startDate && !startDate.includes('T')) {
        // Sadece YYYY-MM-DD formatında ise
        startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString();
      }

      if (endDate && !endDate.includes('T')) {
        // Sadece YYYY-MM-DD formatında ise
        // Bitiş tarihini günün sonuna ayarla
        endDate = new Date(`${endDate}T23:59:59.999Z`).toISOString();
      }

      const report = await storage.getDetailedMovementsReport(startDate, endDate);
      res.json(report);
    } catch (error) {
      console.error("Report generation error:", error);
      res.status(500).json({ message: "Rapor oluşturulurken bir hata oluştu" });
    }
  });

  app.get("/api/reports/export/:type", async (req, res) => {
    try {
      // Check if user has permission
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.can_view_reports && !user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const reportType = req.params.type;
      if (reportType !== 'detailed' && reportType !== 'summary') {
        return res.status(400).json({ message: "Invalid report type" });
      }

      // Varsayılan değerleri ayarla
      const today = new Date();
      let startDate = req.query.startDate as string || new Date(0).toISOString();
      let endDate = req.query.endDate as string || today.toISOString();

      // Tarih formatını kontrol et
      if (startDate && !startDate.includes('T')) {
        startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString();
      }

      if (endDate && !endDate.includes('T')) {
        endDate = new Date(`${endDate}T23:59:59.999Z`).toISOString();
      }

      let report;
      let filename;

      if (reportType === 'detailed') {
        report = await storage.getDetailedMovementsReport(startDate, endDate);
        filename = 'detayli_stok_raporu.xlsx';
      } else {
        report = await storage.getInventoryReport(startDate, endDate);
        filename = 'ozet_stok_raporu.xlsx';
      }

      // Format dates for displaying in Excel
      const formattedStartDate = new Date(startDate).toLocaleDateString('tr-TR');
      const formattedEndDate = new Date(endDate).toLocaleDateString('tr-TR');

      // Generate Excel file
      const workbook = await generateExcel(report, formattedStartDate, formattedEndDate);

      // Write to buffer and save to response
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      return workbook.xlsx.write(res)
        .then(() => {
          res.end();
        });
    } catch (error: any) {
      console.error("Excel export error:", error);
      res.status(500).json({ message: "Rapor dışa aktarılırken bir hata oluştu", error: error.message });
    }
  });

  // User management routes
  app.get("/api/users", async (req, res) => {
    try {
      // Check if user is admin
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const users = await storage.getAllUsers();
      // Don't send passwords back to client
      const usersWithoutPasswords = users.map(({ password, ...rest }) => rest);
      res.json(usersWithoutPasswords);
    } catch (error) {
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      // Check if user is admin
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const { username, password, is_admin, can_add_product, can_view_reports, can_manage_inventory } = req.body;

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Bu kullanıcı adı zaten kullanılıyor" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await storage.createUser({
        username,
        password: hashedPassword,
        is_admin: !!is_admin,
        can_add_product: !!can_add_product,
        can_view_reports: !!can_view_reports,
        can_manage_inventory: !!can_manage_inventory
      });

      // Don't send password back to client
      const { password: _, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Error creating user" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      // Check if user is admin
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as Express.User;
      if (!user.is_admin) {
        return res.status(403).json({ message: "Yetkiniz yok" });
      }

      const id = parseInt(req.params.id);

      // Cannot delete self
      if (id === user.id) {
        return res.status(400).json({ message: "Kendinizi silemezsiniz" });
      }

      // Check if deleting the last admin
      const users = await storage.getAllUsers();
      const admins = users.filter(u => u.is_admin);
      const targetUser = await storage.getUser(id);

      if (targetUser?.is_admin && admins.length <= 1) {
        return res.status(400).json({ message: "Son admin kullanıcıyı silemezsiniz" });
      }

      const success = await storage.deleteUser(id);
      if (success) {
        res.status(200).json({ message: "Kullanıcı başarıyla silindi" });
      } else {
        res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }
    } catch (error) {
      res.status(500).json({ message: "Error deleting user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}