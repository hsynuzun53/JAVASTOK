import { pgTable, text, serial, integer, boolean, timestamp, real, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users Table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  is_admin: boolean("is_admin").default(false).notNull(),
  can_add_product: boolean("can_add_product").default(false).notNull(),
  can_view_reports: boolean("can_view_reports").default(false).notNull(),
  can_manage_inventory: boolean("can_manage_inventory").default(false).notNull(),
});

// Products Table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category").notNull().default("GENEL"),
});

// Inventory Table
export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  product_id: integer("product_id").notNull()
    .references(() => products.id),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  total_price: real("total_price").notNull(),
  last_updated: timestamp("last_updated").defaultNow().notNull(),
  updated_by: integer("updated_by")
    .references(() => users.id),
});

// Inventory Movements Table
export const inventory_movements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  product_id: integer("product_id").notNull()
    .references(() => products.id),
  quantity_change: real("quantity_change").notNull(),
  unit: text("unit").notNull(),
  total_price: real("total_price").notNull(),
  movement_type: text("movement_type").notNull(),
  movement_date: timestamp("movement_date").defaultNow().notNull(),
  user_id: integer("user_id")
    .references(() => users.id),
});

// Schemas and Types
export const insertUserSchema = createInsertSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertProductSchema = createInsertSchema(products);
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertInventorySchema = createInsertSchema(inventory);
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventory.$inferSelect;

export const insertInventoryMovementSchema = createInsertSchema(inventory_movements);
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventory_movements.$inferSelect;

// Custom Types for the application
export type ProductWithInventory = Product & {
  current_quantity?: number;
  unit?: string;
  total_value?: number;
  movement_count?: number;
};

export type InventoryMovementWithDetails = InventoryMovement & {
  product_name?: string;
  product_category?: string;
  local_date?: string;
};
