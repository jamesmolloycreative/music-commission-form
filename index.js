// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  referenceId: text("reference_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  productType: text("product_type").notNull(),
  // Music, Film Soundtrack, Sound Effect, or Sound Effect Set
  projectName: text("project_name").notNull(),
  projectType: text("project_type").notNull(),
  mood: text("mood").notNull(),
  length: integer("length").notNull(),
  // In seconds
  loopOption: text("loop_option").notNull(),
  tempo: integer("tempo").notNull(),
  preferredInstruments: text("preferred_instruments").array().notNull(),
  musicalStyle: text("musical_style"),
  soundEffectType: text("sound_effect_type"),
  // Only for sound effects
  numberOfSounds: integer("number_of_sounds"),
  // Only for sound effect sets
  keyMoments: text("key_moments"),
  cueSheet: json("cue_sheet"),
  // For film soundtrack
  requiresVideoCall: boolean("requires_video_call").default(false),
  filmLength: integer("film_length"),
  // In seconds, for film soundtrack
  // Payment related fields
  pricingType: text("pricing_type").default("quote"),
  // 'fixed' or 'quote'
  priceAmount: integer("price_amount"),
  // in cents for fixed price
  priceCurrency: text("price_currency").default("USD"),
  paymentStatus: text("payment_status").default("pending"),
  // 'pending', 'paid', 'failed'
  paymentId: text("payment_id"),
  // For PayPal order reference
  paymentMethod: text("payment_method"),
  // 'paypal', 'invoice', etc.
  // Delivery fields
  deliveryFormat: text("delivery_format").notNull(),
  deadline: text("deadline"),
  referenceTrackUrl: text("reference_track_url"),
  additionalNotes: text("additional_notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  referenceId: true,
  createdAt: true
});
var branding = pgTable("branding", {
  id: serial("id").primaryKey(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").default("#8845FF"),
  secondaryColor: text("secondary_color").default("#2DD4BF"),
  accentColor: text("accent_color").default("#FB7185"),
  companyName: text("company_name").default("Audio Creator"),
  contactEmail: text("contact_email"),
  aboutText: text("about_text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var insertBrandingSchema = createInsertSchema(branding).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var pricing = pgTable("pricing", {
  id: serial("id").primaryKey(),
  productType: text("product_type").notNull(),
  pricingType: text("pricing_type").notNull().default("quote"),
  // 'fixed' or 'quote'
  basePrice: integer("base_price"),
  // in cents, for fixed price
  priceCurrency: text("price_currency").default("USD"),
  description: text("description"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var insertPricingSchema = createInsertSchema(pricing).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var orderStatuses = {
  PENDING: "pending",
  REVIEWED: "reviewed",
  IN_PROGRESS: "in_progress",
  READY_FOR_REVIEW: "ready_for_review",
  COMPLETED: "completed",
  REJECTED: "rejected"
};

// server/storage.ts
import { nanoid } from "nanoid";
var MemStorage = class {
  users;
  orderList;
  ordersByReference;
  currentUserId;
  currentOrderId;
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.orderList = /* @__PURE__ */ new Map();
    this.ordersByReference = /* @__PURE__ */ new Map();
    this.currentUserId = 1;
    this.currentOrderId = 1;
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  async createUser(insertUser) {
    const id = this.currentUserId++;
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  // Order methods
  async createOrder(insertOrder) {
    const id = this.currentOrderId++;
    const referenceId = `SQ-${nanoid(5).toUpperCase()}`;
    const order = {
      ...insertOrder,
      id,
      referenceId,
      status: orderStatuses.PENDING,
      createdAt: /* @__PURE__ */ new Date()
    };
    this.orderList.set(id, order);
    this.ordersByReference.set(referenceId, order);
    return order;
  }
  async getOrderById(id) {
    return this.orderList.get(id);
  }
  async getOrderByReferenceId(referenceId) {
    return this.ordersByReference.get(referenceId);
  }
  async getAllOrders() {
    return Array.from(this.orderList.values());
  }
  async updateOrderStatus(id, status) {
    const order = this.orderList.get(id);
    if (!order) return void 0;
    const updatedOrder = { ...order, status };
    this.orderList.set(id, updatedOrder);
    this.ordersByReference.set(updatedOrder.referenceId, updatedOrder);
    return updatedOrder;
  }
};
var storage = new MemStorage();

// server/routes.ts
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
async function registerRoutes(app2) {
  app2.post("/api/orders", async (req, res) => {
    try {
      const validatedData = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(validatedData);
      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: {
          id: order.id,
          referenceId: order.referenceId
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({
          success: false,
          message: "Validation error",
          errors: validationError.message
        });
      } else {
        console.error("Error creating order:", error);
        res.status(500).json({
          success: false,
          message: "An error occurred while creating your order"
        });
      }
    }
  });
  app2.get("/api/orders/:referenceId", async (req, res) => {
    try {
      const { referenceId } = req.params;
      const order = await storage.getOrderByReferenceId(referenceId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }
      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      console.error("Error retrieving order:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while retrieving the order"
      });
    }
  });
  app2.get("/api/orders", async (req, res) => {
    try {
      const orders3 = await storage.getAllOrders();
      res.json({
        success: true,
        data: orders3
      });
    } catch (error) {
      console.error("Error retrieving orders:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while retrieving orders"
      });
    }
  });
  app2.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!Object.values(orderStatuses).includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status"
        });
      }
      const updatedOrder = await storage.updateOrderStatus(Number(id), status);
      if (!updatedOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }
      res.json({
        success: true,
        message: "Order status updated",
        data: updatedOrder
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while updating the order status"
      });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid as nanoid2 } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
