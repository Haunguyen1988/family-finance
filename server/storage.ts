import { db } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  families, familyMembers, wallets, categories, transactions,
  type Family, type FamilyMember, type Wallet, type Category,
  type Transaction, type TransactionWithDetails,
  type InsertFamily, type InsertMember, type InsertWallet,
  type InsertCategory, type InsertTransaction,
} from "@shared/schema";

export interface IStorage {
  // Families
  getFamily(id: number): Family | undefined;
  createFamily(data: InsertFamily): Family;

  // Members
  getMembers(familyId: number): FamilyMember[];
  getMember(id: number): FamilyMember | undefined;
  createMember(data: InsertMember): FamilyMember;
  updateMember(id: number, data: Partial<InsertMember>): FamilyMember | undefined;
  deleteMember(id: number): boolean;

  // Wallets
  getWallets(familyId: number): Wallet[];
  getWallet(id: number): Wallet | undefined;
  createWallet(data: InsertWallet): Wallet;
  updateWallet(id: number, data: Partial<InsertWallet>): Wallet | undefined;
  deleteWallet(id: number): boolean;
  updateWalletBalance(id: number, delta: number): void;

  // Categories
  getCategories(familyId?: number): Category[];
  createCategory(data: InsertCategory): Category;
  deleteCategory(id: number): boolean;

  // Transactions
  getTransactions(familyId: number, filters?: { month?: string; memberId?: number; type?: string }): TransactionWithDetails[];
  getTransaction(id: number): TransactionWithDetails | undefined;
  createTransaction(data: InsertTransaction): Transaction;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction | undefined;
  deleteTransaction(id: number): boolean;

  // Stats
  getMonthlyStats(familyId: number, month: string): { income: number; expense: number; balance: number };
  
  // Seed
  seedDefaultData(): void;
}

class SqliteStorage implements IStorage {
  getFamily(id: number) {
    return db.select().from(families).where(eq(families.id, id)).get();
  }

  createFamily(data: InsertFamily) {
    return db.insert(families).values(data).returning().get();
  }

  getMembers(familyId: number) {
    return db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId)).all();
  }

  getMember(id: number) {
    return db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
  }

  createMember(data: InsertMember) {
    return db.insert(familyMembers).values(data).returning().get();
  }

  updateMember(id: number, data: Partial<InsertMember>) {
    return db.update(familyMembers).set(data).where(eq(familyMembers.id, id)).returning().get();
  }

  deleteMember(id: number) {
    const result = db.delete(familyMembers).where(eq(familyMembers.id, id)).run();
    return result.changes > 0;
  }

  getWallets(familyId: number) {
    return db.select().from(wallets).where(eq(wallets.familyId, familyId)).all();
  }

  getWallet(id: number) {
    return db.select().from(wallets).where(eq(wallets.id, id)).get();
  }

  createWallet(data: InsertWallet) {
    return db.insert(wallets).values(data).returning().get();
  }

  updateWallet(id: number, data: Partial<InsertWallet>) {
    return db.update(wallets).set(data).where(eq(wallets.id, id)).returning().get();
  }

  deleteWallet(id: number) {
    const result = db.delete(wallets).where(eq(wallets.id, id)).run();
    return result.changes > 0;
  }

  updateWalletBalance(id: number, delta: number) {
    const wallet = this.getWallet(id);
    if (wallet) {
      db.update(wallets).set({ balance: wallet.balance + delta }).where(eq(wallets.id, id)).run();
    }
  }

  getCategories(familyId?: number) {
    if (familyId) {
      return db.select().from(categories).where(
        eq(categories.isDefault, true)
      ).all().concat(
        db.select().from(categories).where(
          and(eq(categories.isDefault, false), eq(categories.familyId, familyId))
        ).all()
      );
    }
    return db.select().from(categories).where(eq(categories.isDefault, true)).all();
  }

  createCategory(data: InsertCategory) {
    return db.insert(categories).values(data).returning().get();
  }

  deleteCategory(id: number) {
    const result = db.delete(categories).where(eq(categories.id, id)).run();
    return result.changes > 0;
  }

  getTransactions(familyId: number, filters?: { month?: string; memberId?: number; type?: string }) {
    const all = db.select().from(transactions)
      .where(eq(transactions.familyId, familyId))
      .orderBy(desc(transactions.date))
      .all();

    let filtered = all;
    if (filters?.month) {
      filtered = filtered.filter(t => t.date.startsWith(filters.month!));
    }
    if (filters?.memberId) {
      filtered = filtered.filter(t => t.memberId === filters.memberId);
    }
    if (filters?.type && filters.type !== "all") {
      filtered = filtered.filter(t => t.type === filters.type);
    }

    const members = this.getMembers(familyId);
    const cats = this.getCategories(familyId);
    const wals = this.getWallets(familyId);

    return filtered.map(t => ({
      ...t,
      member: members.find(m => m.id === t.memberId)!,
      category: cats.find(c => c.id === t.categoryId)!,
      wallet: wals.find(w => w.id === t.walletId)!,
    }));
  }

  getTransaction(id: number) {
    const t = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!t) return undefined;
    const member = this.getMember(t.memberId);
    const cat = db.select().from(categories).where(eq(categories.id, t.categoryId)).get();
    const wallet = this.getWallet(t.walletId);
    return { ...t, member: member!, category: cat!, wallet: wallet! };
  }

  createTransaction(data: InsertTransaction) {
    const tx = db.insert(transactions).values(data).returning().get();
    // Update wallet balance
    const delta = data.type === "income" ? data.amount : -data.amount;
    this.updateWalletBalance(data.walletId, delta);
    return tx;
  }

  updateTransaction(id: number, data: Partial<InsertTransaction>) {
    const old = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (old) {
      // Reverse old balance change
      const oldDelta = old.type === "income" ? old.amount : -old.amount;
      this.updateWalletBalance(old.walletId, -oldDelta);
    }
    const updated = db.update(transactions).set(data).where(eq(transactions.id, id)).returning().get();
    if (updated) {
      // Apply new balance change
      const newWalletId = data.walletId ?? old?.walletId;
      const newAmount = data.amount ?? old?.amount ?? 0;
      const newType = data.type ?? old?.type ?? "expense";
      if (newWalletId) {
        const delta = newType === "income" ? newAmount : -newAmount;
        this.updateWalletBalance(newWalletId, delta);
      }
    }
    return updated;
  }

  deleteTransaction(id: number) {
    const old = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (old) {
      const delta = old.type === "income" ? old.amount : -old.amount;
      this.updateWalletBalance(old.walletId, -delta);
    }
    const result = db.delete(transactions).where(eq(transactions.id, id)).run();
    return result.changes > 0;
  }

  getMonthlyStats(familyId: number, month: string) {
    const txs = this.getTransactions(familyId, { month });
    const income = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const walletList = this.getWallets(familyId);
    const balance = walletList.reduce((s, w) => s + w.balance, 0);
    return { income, expense, balance };
  }

  seedDefaultData() {
    const existingFamily = db.select().from(families).get();
    if (existingFamily) return;

    // Tạo gia đình
    const family = this.createFamily({ name: "Gia đình Hậu" });

    // Tạo thành viên
    const members = [
      { familyId: family.id, name: "Bố (Hậu)", role: "admin" as const, avatarColor: "#01696F" },
      { familyId: family.id, name: "Mẹ (Vợ)", role: "member" as const, avatarColor: "#a12c7b" },
      { familyId: family.id, name: "Bé Lớn", role: "child" as const, avatarColor: "#da7101" },
      { familyId: family.id, name: "Bé Nhỏ", role: "child" as const, avatarColor: "#437a22" },
    ];
    const createdMembers = members.map(m => this.createMember(m));

    // Tạo ví
    const walletData = [
      { familyId: family.id, name: "Tiền mặt", type: "cash" as const, balance: 2000000, icon: "banknotes" },
      { familyId: family.id, name: "Ngân hàng VCB", type: "bank" as const, balance: 15000000, icon: "building-columns" },
      { familyId: family.id, name: "Tiết kiệm", type: "savings" as const, balance: 50000000, icon: "piggy-bank" },
    ];
    const createdWallets = walletData.map(w => this.createWallet(w));

    // Tạo danh mục mặc định
    const defaultCategories = [
      // Thu nhập
      { name: "Lương", icon: "💰", type: "income" as const, color: "#437a22", isDefault: true },
      { name: "Thưởng", icon: "🎁", type: "income" as const, color: "#437a22", isDefault: true },
      { name: "Đầu tư", icon: "📈", type: "income" as const, color: "#006494", isDefault: true },
      { name: "Khác (Thu)", icon: "➕", type: "income" as const, color: "#437a22", isDefault: true },
      // Chi tiêu
      { name: "Ăn uống", icon: "🍜", type: "expense" as const, color: "#da7101", isDefault: true },
      { name: "Di chuyển", icon: "🚗", type: "expense" as const, color: "#964219", isDefault: true },
      { name: "Học phí", icon: "📚", type: "expense" as const, color: "#7a39bb", isDefault: true },
      { name: "Sức khỏe", icon: "🏥", type: "expense" as const, color: "#a12c7b", isDefault: true },
      { name: "Hóa đơn", icon: "💡", type: "expense" as const, color: "#d19900", isDefault: true },
      { name: "Mua sắm", icon: "🛒", type: "expense" as const, color: "#da7101", isDefault: true },
      { name: "Nhà ở", icon: "🏠", type: "expense" as const, color: "#964219", isDefault: true },
      { name: "Giải trí", icon: "🎮", type: "expense" as const, color: "#7a39bb", isDefault: true },
      { name: "Khác (Chi)", icon: "💸", type: "expense" as const, color: "#a13544", isDefault: true },
    ];
    const createdCats = defaultCategories.map(c => this.createCategory(c));

    // Seed giao dịch mẫu (tháng hiện tại)
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const sampleTx = [
      { familyId: family.id, memberId: createdMembers[0].id, categoryId: createdCats[0].id, walletId: createdWallets[1].id, amount: 25000000, type: "income" as const, note: "Lương tháng 5", date: `${month}-01` },
      { familyId: family.id, memberId: createdMembers[1].id, categoryId: createdCats[0].id, walletId: createdWallets[1].id, amount: 18000000, type: "income" as const, note: "Lương vợ", date: `${month}-01` },
      { familyId: family.id, memberId: createdMembers[0].id, categoryId: createdCats[4].id, walletId: createdWallets[0].id, amount: 1500000, type: "expense" as const, note: "Tiền ăn tuần 1", date: `${month}-03` },
      { familyId: family.id, memberId: createdMembers[1].id, categoryId: createdCats[9].id, walletId: createdWallets[0].id, amount: 800000, type: "expense" as const, note: "Mua đồ cho con", date: `${month}-04` },
      { familyId: family.id, memberId: createdMembers[0].id, categoryId: createdCats[10].id, walletId: createdWallets[1].id, amount: 5000000, type: "expense" as const, note: "Tiền nhà tháng 5", date: `${month}-05` },
      { familyId: family.id, memberId: createdMembers[1].id, categoryId: createdCats[6].id, walletId: createdWallets[1].id, amount: 3500000, type: "expense" as const, note: "Học phí bé lớn", date: `${month}-06` },
    ];
    sampleTx.forEach(t => this.createTransaction(t));
  }
}

export const storage = new SqliteStorage();
