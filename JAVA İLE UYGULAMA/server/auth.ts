import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { bcrypt } from "./utils";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hashSync(password, 10);
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  return bcrypt.compareSync(supplied, stored);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "restaurant-app-secret",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 gün
      secure: process.env.NODE_ENV === "production",
    }
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Geçersiz kullanıcı adı" });
        }
        
        if (!(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Geçersiz şifre" });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(new Error("Kullanıcı bulunamadı"));
      }
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Yeni kullanıcı kaydı (Sadece admin kullanabilir)
  app.post("/api/register", async (req, res, next) => {
    try {
      // Oturum kontrolü
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Yetkisiz erişim" });
      }
      
      const currentUser = req.user as SelectUser;
      if (!currentUser.is_admin) {
        return res.status(403).json({ error: "Bu işlem için admin yetkisi gerekiyor" });
      }
      
      // Kullanıcı adı kontrolü
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ error: "Bu kullanıcı adı zaten kullanılıyor" });
      }
      
      // Şifreyi hashleme
      const hashedPassword = await hashPassword(req.body.password);
      
      // Yeni kullanıcı oluşturma
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });
      
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  // Kullanıcı girişi
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ error: info?.message || "Giriş başarısız" });
      }
      
      req.login(user, (err: any) => {
        if (err) return next(err);
        return res.status(200).json(user);
      });
    })(req, res, next);
  });

  // Çıkış yap
  app.post("/api/logout", (req, res, next) => {
    req.logout((err: any) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Mevcut oturum kullanıcısını getir
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Yetkisiz erişim" });
    }
    res.json(req.user);
  });

  // Admin kullanıcısını oluştur (eğer yoksa)
  createAdminUser();
}

// Admin kullanıcısını oluştur (eğer yoksa)
async function createAdminUser() {
  try {
    const adminUser = await storage.getUserByUsername("admin");
    if (!adminUser) {
      await storage.createUser({
        username: "admin",
        password: await hashPassword("1234"),
        is_admin: true,
        can_add_product: true,
        can_view_reports: true,
        can_manage_inventory: true
      });
      console.log("Admin kullanıcısı oluşturuldu");
    }
  } catch (error) {
    console.error("Admin kullanıcısı oluşturulurken hata oluştu:", error);
  }
}