import { users, products, inventory, inventory_movements } from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct,
  Inventory, InsertInventory,
  InventoryMovement, InsertInventoryMovement,
  ProductWithInventory,
  InventoryMovementWithDetails
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db, pool } from "./db";
import { and, asc, between, desc, eq, gte, lte } from "drizzle-orm";
import { bcrypt } from "./utils";

const PostgresSessionStore = connectPg(session);

// modify the interface with any CRUD methods
// you might need
export interface IStorage {
  // Session store
  sessionStore: session.Store;
  
  // User Management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  getAllUsers(): Promise<User[]>;
  
  // Product Management
  createProduct(product: InsertProduct): Promise<Product>;
  getProduct(id: number): Promise<Product | undefined>;
  getProductByName(name: string): Promise<Product | undefined>;
  getAllProducts(): Promise<Product[]>;
  getProductsByCategory(category: string): Promise<Product[]>;
  deleteProduct(id: number): Promise<boolean>;
  
  // Inventory Management
  getInventoryItem(productId: number): Promise<Inventory | undefined>;
  updateInventory(item: InsertInventory): Promise<Inventory>;
  getAllInventory(): Promise<Inventory[]>;
  
  // Inventory Movement
  createInventoryMovement(movement: InsertInventoryMovement): Promise<InventoryMovement>;
  getInventoryMovement(id: number): Promise<InventoryMovement | undefined>;
  getLatestInventoryMovements(limit: number): Promise<InventoryMovementWithDetails[]>;
  deleteInventoryMovement(id: number): Promise<boolean>;
  
  // Reports
  getInventoryReport(startDate: string, endDate: string): Promise<ProductWithInventory[]>;
  getDetailedMovementsReport(startDate: string, endDate: string): Promise<InventoryMovementWithDetails[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private products: Map<number, Product>;
  private inventory: Map<number, Inventory>;
  private inventoryMovements: Map<number, InventoryMovement>;
  sessionStore!: session.Store; // ! kullanarak başlangıçta atanmayabileceğini belirtiyoruz
  private userIdCounter: number;
  private productIdCounter: number;
  private inventoryIdCounter: number;
  private movementIdCounter: number;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.inventory = new Map();
    this.inventoryMovements = new Map();
    // Bu sınıf artık kullanılmadığı için burayı siliyoruz
    this.userIdCounter = 1;
    this.productIdCounter = 1;
    this.inventoryIdCounter = 1;
    this.movementIdCounter = 1;
    
    // Initialize with admin user
    this.createUser({
      username: "admin",
      password: "$2b$10$enyk9jDoU46isk1pWPoxROnncUaC6Qbso9ETHKHCiwo/uEt00VP6.", // hashed "1234"
      is_admin: true,
      can_add_product: true,
      can_view_reports: true,
      can_manage_inventory: true
    });
  }

  // User Management
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    // Default değerleri ayarla
    const user: User = { 
      ...insertUser, 
      id,
      is_admin: insertUser.is_admin ?? false,
      can_add_product: insertUser.can_add_product ?? false,
      can_view_reports: insertUser.can_view_reports ?? false,
      can_manage_inventory: insertUser.can_manage_inventory ?? false
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Product Management
  async createProduct(product: InsertProduct): Promise<Product> {
    const id = this.productIdCounter++;
    const newProduct: Product = { 
      ...product, 
      id,
      category: product.category || "GENEL"
    };
    this.products.set(id, newProduct);
    return newProduct;
  }

  async getProduct(id: number): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    return Array.from(this.products.values()).find(
      (product) => product.name.toLowerCase() === name.toLowerCase()
    );
  }

  async getAllProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    return Array.from(this.products.values()).filter(
      (product) => product.category === category
    );
  }

  async deleteProduct(id: number): Promise<boolean> {
    // First, delete all related inventory and movements
    const inventoryItems = Array.from(this.inventory.values())
      .filter(item => item.product_id === id);
    
    for (const item of inventoryItems) {
      this.inventory.delete(item.id);
    }
    
    const movements = Array.from(this.inventoryMovements.values())
      .filter(movement => movement.product_id === id);
    
    for (const movement of movements) {
      this.inventoryMovements.delete(movement.id);
    }
    
    return this.products.delete(id);
  }

  // Inventory Management
  async getInventoryItem(productId: number): Promise<Inventory | undefined> {
    return Array.from(this.inventory.values()).find(
      (item) => item.product_id === productId
    );
  }

  async updateInventory(item: InsertInventory): Promise<Inventory> {
    const existingItem = await this.getInventoryItem(item.product_id);
    
    if (existingItem) {
      const updatedItem: Inventory = {
        ...existingItem,
        quantity: existingItem.quantity + item.quantity,
        unit: item.unit,
        total_price: existingItem.total_price + item.total_price,
        last_updated: new Date(),
        updated_by: item.updated_by !== undefined ? item.updated_by : null
      };
      this.inventory.set(existingItem.id, updatedItem);
      return updatedItem;
    } else {
      const id = this.inventoryIdCounter++;
      const newItem: Inventory = {
        ...item,
        id,
        last_updated: new Date(),
        updated_by: item.updated_by !== undefined ? item.updated_by : null
      };
      this.inventory.set(id, newItem);
      return newItem;
    }
  }

  async getAllInventory(): Promise<Inventory[]> {
    return Array.from(this.inventory.values());
  }

  // Inventory Movement
  async createInventoryMovement(movement: InsertInventoryMovement): Promise<InventoryMovement> {
    const id = this.movementIdCounter++;
    const newMovement: InventoryMovement = {
      ...movement,
      id,
      movement_date: new Date(),
      user_id: movement.user_id !== undefined ? movement.user_id : null
    };
    this.inventoryMovements.set(id, newMovement);
    return newMovement;
  }

  async getInventoryMovement(id: number): Promise<InventoryMovement | undefined> {
    return this.inventoryMovements.get(id);
  }

  async getLatestInventoryMovements(limit: number): Promise<InventoryMovementWithDetails[]> {
    const movements = Array.from(this.inventoryMovements.values())
      .sort((a, b) => b.movement_date.getTime() - a.movement_date.getTime())
      .slice(0, limit);

    const result: InventoryMovementWithDetails[] = [];
    
    for (const movement of movements) {
      const product = await this.getProduct(movement.product_id);
      if (product) {
        result.push({
          ...movement,
          product_name: product.name,
          product_category: product.category,
          local_date: movement.movement_date.toLocaleString()
        });
      }
    }
    
    return result;
  }

  async deleteInventoryMovement(id: number): Promise<boolean> {
    const movement = this.inventoryMovements.get(id);
    if (!movement) return false;
    
    // Update inventory
    const inventoryItem = await this.getInventoryItem(movement.product_id);
    if (inventoryItem) {
      const updatedItem: Inventory = {
        ...inventoryItem,
        quantity: inventoryItem.quantity - movement.quantity_change,
        total_price: inventoryItem.total_price - movement.total_price,
        last_updated: new Date(),
        updated_by: inventoryItem.updated_by
      };
      this.inventory.set(inventoryItem.id, updatedItem);
    }
    
    return this.inventoryMovements.delete(id);
  }

  // Reports
  async getInventoryReport(startDate: string, endDate: string): Promise<ProductWithInventory[]> {
    const products = await this.getAllProducts();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const result: ProductWithInventory[] = [];
    
    for (const product of products) {
      const inventoryItem = await this.getInventoryItem(product.id);
      
      // Get movements for this product in the date range
      const movements = Array.from(this.inventoryMovements.values())
        .filter(m => 
          m.product_id === product.id && 
          m.movement_date >= start && 
          m.movement_date <= end
        );
      
      const totalMovement = movements.reduce((sum, m) => sum + m.quantity_change, 0);
      
      result.push({
        ...product,
        current_quantity: inventoryItem?.quantity || 0,
        unit: inventoryItem?.unit || "",
        total_value: inventoryItem?.total_price || 0,
        movement_count: movements.length
      });
    }
    
    return result;
  }

  async getDetailedMovementsReport(startDate: string, endDate: string): Promise<InventoryMovementWithDetails[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const movements = Array.from(this.inventoryMovements.values())
      .filter(m => m.movement_date >= start && m.movement_date <= end)
      .sort((a, b) => b.movement_date.getTime() - a.movement_date.getTime());
    
    const result: InventoryMovementWithDetails[] = [];
    
    for (const movement of movements) {
      const product = await this.getProduct(movement.product_id);
      if (product) {
        result.push({
          ...movement,
          product_name: product.name,
          product_category: product.category,
          local_date: movement.movement_date.toLocaleString()
        });
      }
    }
    
    return result;
  }
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User Management
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Varsayılan değerleri ayarla
    const userData = {
      ...insertUser,
      is_admin: insertUser.is_admin ?? false,
      can_add_product: insertUser.can_add_product ?? false,
      can_view_reports: insertUser.can_view_reports ?? false,
      can_manage_inventory: insertUser.can_manage_inventory ?? false
    };

    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      await db.delete(users).where(eq(users.id, id));
      return true;
    } catch (error) {
      console.error("Error deleting user:", error);
      return false;
    }
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  // Product Management
  async createProduct(product: InsertProduct): Promise<Product> {
    const productData = {
      ...product,
      category: product.category || "GENEL"
    };
    
    const [newProduct] = await db.insert(products).values(productData).returning();
    return newProduct;
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.name, name));
    
    return product;
  }

  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products);
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    return db
      .select()
      .from(products)
      .where(eq(products.category, category));
  }

  async deleteProduct(id: number): Promise<boolean> {
    try {
      // İlgili tüm envanter hareketlerini ve stok kayıtlarını siliyoruz
      await db.delete(inventory_movements).where(eq(inventory_movements.product_id, id));
      await db.delete(inventory).where(eq(inventory.product_id, id));
      await db.delete(products).where(eq(products.id, id));
      return true;
    } catch (error) {
      console.error("Error deleting product:", error);
      return false;
    }
  }

  // Inventory Management
  async getInventoryItem(productId: number): Promise<Inventory | undefined> {
    const [item] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.product_id, productId));
    
    return item;
  }

  async updateInventory(item: InsertInventory): Promise<Inventory> {
    const existingItem = await this.getInventoryItem(item.product_id);
    
    if (existingItem) {
      const [updatedItem] = await db
        .update(inventory)
        .set({
          quantity: existingItem.quantity + item.quantity,
          unit: item.unit,
          total_price: existingItem.total_price + item.total_price,
          last_updated: new Date(),
          updated_by: item.updated_by !== undefined ? item.updated_by : null
        })
        .where(eq(inventory.id, existingItem.id))
        .returning();
      
      return updatedItem;
    } else {
      const newItem = {
        ...item,
        last_updated: new Date(),
        updated_by: item.updated_by !== undefined ? item.updated_by : null
      };
      
      const [createdItem] = await db
        .insert(inventory)
        .values(newItem)
        .returning();
      
      return createdItem;
    }
  }

  async getAllInventory(): Promise<Inventory[]> {
    return db.select().from(inventory);
  }

  // Inventory Movement
  async createInventoryMovement(movement: InsertInventoryMovement): Promise<InventoryMovement> {
    const newMovement = {
      ...movement,
      movement_date: new Date(),
      user_id: movement.user_id !== undefined ? movement.user_id : null
    };
    
    const [createdMovement] = await db
      .insert(inventory_movements)
      .values(newMovement)
      .returning();
    
    return createdMovement;
  }

  async getInventoryMovement(id: number): Promise<InventoryMovement | undefined> {
    const [movement] = await db
      .select()
      .from(inventory_movements)
      .where(eq(inventory_movements.id, id));
    
    return movement;
  }

  async getLatestInventoryMovements(limit: number): Promise<InventoryMovementWithDetails[]> {
    const movements = await db
      .select({
        id: inventory_movements.id,
        product_id: inventory_movements.product_id,
        quantity_change: inventory_movements.quantity_change,
        unit: inventory_movements.unit,
        total_price: inventory_movements.total_price,
        movement_date: inventory_movements.movement_date,
        user_id: inventory_movements.user_id,
        movement_type: inventory_movements.movement_type,
        product_name: products.name,
        product_category: products.category
      })
      .from(inventory_movements)
      .innerJoin(products, eq(inventory_movements.product_id, products.id))
      .orderBy(desc(inventory_movements.movement_date))
      .limit(limit);

    return movements.map(m => ({
      ...m,
      local_date: m.movement_date.toLocaleString()
    }));
  }

  async deleteInventoryMovement(id: number): Promise<boolean> {
    try {
      // Hareketi bul
      const [movement] = await db
        .select()
        .from(inventory_movements)
        .where(eq(inventory_movements.id, id));
      
      if (!movement) return false;
      
      // Envanteri güncelle
      const [inventoryItem] = await db
        .select()
        .from(inventory)
        .where(eq(inventory.product_id, movement.product_id));
        
      if (inventoryItem) {
        await db
          .update(inventory)
          .set({
            quantity: inventoryItem.quantity - movement.quantity_change,
            total_price: inventoryItem.total_price - movement.total_price,
            last_updated: new Date()
          })
          .where(eq(inventory.id, inventoryItem.id));
      }
      
      // Hareketi sil
      await db
        .delete(inventory_movements)
        .where(eq(inventory_movements.id, id));
      
      return true;
    } catch (error) {
      console.error("Error deleting inventory movement:", error);
      return false;
    }
  }

  // Reports
  async getInventoryReport(startDate: string, endDate: string): Promise<ProductWithInventory[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Önce tüm ürünleri al
    const productsList = await this.getAllProducts();
    const result: ProductWithInventory[] = [];
    
    for (const product of productsList) {
      // Bu ürün için envanter bilgisini al
      const inventoryItem = await this.getInventoryItem(product.id);
      
      // Bu ürün için belirli tarih aralığındaki hareketleri say
      const movements = await db
        .select()
        .from(inventory_movements)
        .where(
          and(
            eq(inventory_movements.product_id, product.id),
            gte(inventory_movements.movement_date, start),
            lte(inventory_movements.movement_date, end)
          )
        );
      
      result.push({
        ...product,
        current_quantity: inventoryItem?.quantity || 0,
        unit: inventoryItem?.unit || "",
        total_value: inventoryItem?.total_price || 0,
        movement_count: movements.length
      });
    }
    
    return result;
  }

  async getDetailedMovementsReport(startDate: string, endDate: string): Promise<InventoryMovementWithDetails[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const movements = await db
      .select({
        id: inventory_movements.id,
        product_id: inventory_movements.product_id,
        quantity_change: inventory_movements.quantity_change,
        unit: inventory_movements.unit,
        total_price: inventory_movements.total_price,
        movement_date: inventory_movements.movement_date,
        user_id: inventory_movements.user_id,
        movement_type: inventory_movements.movement_type,
        product_name: products.name,
        product_category: products.category
      })
      .from(inventory_movements)
      .innerJoin(products, eq(inventory_movements.product_id, products.id))
      .where(
        and(
          gte(inventory_movements.movement_date, start),
          lte(inventory_movements.movement_date, end)
        )
      )
      .orderBy(desc(inventory_movements.movement_date));
    
    return movements.map(m => ({
      ...m,
      local_date: m.movement_date.toLocaleString()
    }));
  }
}

// MemStorage yerine DatabaseStorage kullanarak tüm verilerin veritabanında saklanmasını sağlıyoruz
export const storage = new DatabaseStorage();
