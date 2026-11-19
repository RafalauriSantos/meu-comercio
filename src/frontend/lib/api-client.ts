import type { ProductUnit } from '@/shared/domain/product-unit';
import type { PeriodKind } from '@/modules/reports/domain/report-period';
import { notifySessionExpired } from './session-expired';
import { classifyStatus, fallbackMessage, goesToLogin, timeoutFor, type ApiErrorKind } from './api-error';

export type { ApiErrorKind } from './api-error';

export type { SalesReport } from '@/modules/reports/application/get-sales-report.use-case';
import type { SalesReport } from '@/modules/reports/application/get-sales-report.use-case';

/** The settings of the shop that the owner can change. */
export interface StoreSettings {
  /** Off: a sale needs no stock and takes nothing out of it, and the stock screens are hidden. */
  stockControlEnabled: boolean;
}

/** A confirmed sale of today that can be picked to be cancelled. */
export interface RecentSaleItem {
  id: string;
  /** The first 8 characters of the id: what the printed receipt shows. */
  shortId: string;
  createdAt: string;
  total: string;
  operatorId: string;
  items: string;
}

export interface ProductImportReport {
  valid: Array<{
    line: number;
    barcode: string;
    name: string;
    salePrice: string;
    unit: ProductUnit;
    initialStock: number;
  }>;
  /** Existing products that the sheet corrects, with name and price before and after. */
  corrected: Array<{
    line: number;
    barcode: string;
    unit: ProductUnit;
    before: { name: string; salePrice: string };
    after: { name: string; salePrice: string };
    /** The price moves by more than 50 percent, up or down. */
    priceChangeOver50: boolean;
  }>;
  /** Existing products already equal to the sheet. */
  unchanged: Array<{ line: number; barcode: string; name: string }>;
  /** Deleted products: left as they are. */
  skipped: Array<{ line: number; barcode: string; name: string; reason: string }>;
  errors: Array<{ line: number; message: string }>;
  imported: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Array<{ field: string; message: string }>,
    public readonly code?: string,
    /** Stable type of the failure. Without it, it comes from the status (a 401 counts as an expired session). */
    public readonly kind: ApiErrorKind = classifyStatus(status, '')
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Only an expired session sends the person to the login. Network, time out, 429, 5xx and any bug stay on the screen. */
export const shouldGoToLogin = (err: unknown): boolean => err instanceof ApiError && goesToLogin(err.kind);

/** What to show when a screen could not load. */
export const loadErrorMessage = (err: unknown): string =>
  err instanceof ApiError ? err.message : fallbackMessage('server');

/** The request never got an answer: no connection, or our time limit. Never an expired session. */
export function isConnectionError(err: unknown): boolean {
  if (err instanceof ApiError) return err.kind === 'network' || err.kind === 'timeout';
  return err instanceof TypeError;
}

export interface AuthUser {
  username: string;
  merchantId: string;
  authorities: string[];
  isOwner: boolean;
}

export interface SetupStatus {
  setupRequired: boolean;
  databaseConnected: boolean;
  error?: string;
}

export interface ProductItem {
  id: string;
  barcode: string;
  name: string;
  /** Per unit, or per kg when the unit is 'KG'. */
  salePrice: number;
  /** Units, or grams when the unit is 'KG'. */
  availableQuantity: number;
  /** Missing means by the unit. */
  unit?: ProductUnit;
  active?: boolean;
  /** ISO. Sent back as expectedUpdatedAt when editing. */
  updatedAt?: string;
}

export interface ProductPatch {
  name?: string;
  /** Decimal string, never a number. */
  salePrice?: string;
  barcode?: string;
  /** Exclusive with the fields above: the server picks the new code. */
  generateBarcode?: never;
  /** false excludes (deactivates) the product, true restores it. Owner only. */
  active?: boolean;
  expectedUpdatedAt?: string;
}

export interface GenerateBarcodePatch {
  generateBarcode: true;
  expectedUpdatedAt?: string;
}

/** Over all active products. With stock control off the three stock fields are null. stockValue is a decimal string. */
export interface ProductsSummary {
  total: number;
  lowStockCount: number | null;
  outOfStockCount: number | null;
  stockValue: string | null;
}

export interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  creditLimit?: number | string;
  /** Fiado blocked by the owner (D-26). Missing counts as not blocked. */
  creditBlocked?: boolean;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCustomerPayload {
  name: string;
  phone: string;
  /** Decimal string, never a number. The operator never sends it (the customer is born with R$ 0,00). */
  creditLimit?: number | string;
  /** The owner's PIN, sent only with a limit above zero. */
  ownerPin?: string;
}

export interface CustomerPatch {
  name?: string;
  /** Digits or any text the backend accepts as a phone. */
  phone?: string;
  /** Decimal string, never a number. */
  creditLimit?: string;
  creditBlocked?: boolean;
  /** false excludes (deactivates) the customer, true restores it. Owner only. */
  active?: boolean;
  expectedUpdatedAt?: string;
  /** The owner's 6-digit PIN: sent when the limit goes up, and to exclude a customer. */
  ownerPin?: string;
}

export interface OperatorItem {
  username: string;
  enabled: boolean;
  createdAt: string;
  authorities: string[];
}


export interface CustomerBalance {
  customerId: string;
  name: string;
  phone: string;
  active: boolean;
  creditLimit: string;
  currentDebt: string;
  availableCredit: string;
  totalDebits: string;
  totalCredits: string;
}

export interface StatementItem {
  id: string;
  type: 'PURCHASE' | 'PAYMENT' | 'REVERSAL';
  amount: string;
  balanceAfter: string;
  createdAt: string;
  saleId: string | null;
  operator: string;
  note: string | null;
}

export interface CustomerStatement {
  items: StatementItem[];
  nextCursor: string | null;
}

export interface CashSessionData {
  id: string;
  openedBy: string;
  openingBalance: string | number;
  openedAt: string;
  expectedCash: string | number;
  movementsCount?: number;
}

export interface CurrentCashResponse {
  open: boolean;
  session: CashSessionData | null;
}

export interface CreditMetricsData {
  totalOutstandingCredit: string;
  totalSettledCredit: string;
  activeDebtorsCount: number;
}

export interface CreateSaleItem {
  productId: string;
  quantity: number;
}

export interface CreateSalePayment {
  method: 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'TAB';
  amount: string | number;
  receivedAmount?: string | number | null;
  installments?: number;
  externalReference?: string | null;
}

export interface CreateSalePayload {
  items: CreateSaleItem[];
  payments: CreateSalePayment[];
  discountAmount?: string | number | null;
  discountReason?: string | null;
  idempotencyKey?: string | null;
  ownerPin?: string;
}

export interface SaleResponse {
  id: string;
  saleNumber?: string;
  merchantId: string;
  cashSessionId: string;
  operatorId: string;
  status: string;
  subtotal: string;
  discountAmount?: string;
  discountReason?: string;
  total: string;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }>;
  payments: Array<{
    id: string;
    method: string;
    amount: string;
    receivedAmount?: string;
    changeAmount?: string;
  }>;
}

export type ApiRequestOptions = RequestInit & {
  /** Overrides the time limit of this call in ms. null: no limit. Missing: by route (see timeoutFor). */
  timeoutMs?: number | null;
  /** Success returns the Response itself (a file), not parsed JSON. Errors are handled the same way. */
  raw?: boolean;
};

export async function apiRequest<T>(
  path: string,
  { timeoutMs, raw, ...options }: ApiRequestOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const limit = timeoutMs === undefined ? timeoutFor(options.method ?? 'GET', path) : timeoutMs;
  const controller = new AbortController();
  let timedOut = false;
  const timer = limit
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, limit)
    : undefined;
  // A call that never got an answer: our time limit, or no connection. Never an expired session.
  const noAnswer = () => {
    const kind = timedOut ? 'timeout' : 'network';
    return new ApiError(0, fallbackMessage(kind), undefined, undefined, kind);
  };

  try {
    let response: Response;
    try {
      response = await fetch(path, {
        ...options,
        credentials: 'include',
        headers,
        signal: controller.signal,
      });
    } catch {
      throw noAnswer();
    }

    if (!response.ok) {
      const kind = classifyStatus(response.status, path);
      let message = fallbackMessage(kind);
      let errors: Array<{ field: string; message: string }> | undefined;
      let code: string | undefined;
      try {
        const data = await response.json();
        if (data.message) message = data.message;
        else if (typeof data.error === 'string') message = data.error;
        if (data.errors) errors = data.errors;
        if (typeof data.code === 'string') code = data.code;
      } catch {
        // Body not JSON
      }
      if (kind === 'session-expired') notifySessionExpired();
      throw new ApiError(response.status, message, errors, code, kind);
    }

    if (raw) return response as unknown as T;

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      // The time limit also covers reading the body.
      throw timedOut ? noAnswer() : err;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** The sheet of the active products (owner only). The name comes from Content-Disposition. */
export async function exportProducts(): Promise<{ blob: Blob; filename: string }> {
  const response = await apiRequest<Response>('/api/products/export', { raw: true });
  const filename = /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'produtos.csv';
  return { blob: await response.blob(), filename };
}

export const apiClient = {
  // Setup & Registration
  getSetupStatus: () => apiRequest<SetupStatus>('/api/setup/status'),
  setupOwner: (payload: { username: string; password: string; authorizationPin: string; merchantName?: string }) =>
    apiRequest<AuthUser>('/api/setup/owner', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  registerMerchant: (payload: {
    merchantName: string;
    username: string;
    password: string;
    authorizationPin: string;
    email?: string | null;
  }) =>
    apiRequest<AuthUser>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Auth
  me: () => apiRequest<AuthUser>('/api/auth/me'),
  login: (payload: { username: string; password: string }) =>
    apiRequest<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () =>
    apiRequest<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  // Cash Sessions
  getCurrentCash: () => apiRequest<CurrentCashResponse>('/api/cash/current'),
  openCash: (payload: { openingBalance: number | string }) =>
    apiRequest<CashSessionData>('/api/cash/open', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  closeCash: (payload: { sessionId: string; closingBalance: number | string; discrepancyReason?: string }) =>
    apiRequest<{
      success: boolean;
      expectedCash: string;
      closingBalance: string;
      difference: string;
      closedBy: string;
    }>('/api/cash/close', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordWithdrawal: (payload: { amount: number | string; reason: string }) =>
    apiRequest<{
      success: boolean;
      sessionId: string;
      movementType: string;
      amount: string;
      expectedCash: string;
      reason: string;
    }>('/api/cash/withdrawal', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordDeposit: (payload: { amount: number | string; reason: string }) =>
    apiRequest<{
      success: boolean;
      sessionId: string;
      movementType: string;
      amount: string;
      expectedCash: string;
      reason: string;
    }>('/api/cash/deposit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Products & Inventory
  findProductByBarcode: (barcode: string) =>
    apiRequest<ProductItem>(`/api/products/barcode/${encodeURIComponent(barcode)}`),
  searchProducts: (query: string) =>
    apiRequest<{ items: ProductItem[] }>(`/api/products/search?q=${encodeURIComponent(query)}`),
  /** `active: false` lists only the excluded products (owner only). */
  listProducts: (query = '', page?: number, pageSize?: number, active?: boolean) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (page !== undefined) params.set('page', String(page));
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    if (active === false) params.set('active', 'false');
    const qs = params.toString();
    return apiRequest<{ items: ProductItem[]; hasMore?: boolean }>(`/api/products${qs ? `?${qs}` : ''}`);
  },
  getProductsSummary: () => apiRequest<ProductsSummary>('/api/products/summary'),
  createProduct: (payload: {
    barcode?: string;
    name: string;
    salePrice: number | string;
    initialStock?: number;
    unit?: ProductUnit;
  }) =>
    apiRequest<ProductItem>('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        barcode: payload.barcode || undefined,
        name: payload.name,
        salePrice: payload.salePrice,
        initialStock: payload.initialStock ?? 0,
        unit: payload.unit ?? 'UN',
      }),
    }),
  updateProduct: (id: string, patch: ProductPatch | GenerateBarcodePatch) =>
    apiRequest<ProductItem>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getSalesReport: (params: { period: PeriodKind; from?: string; to?: string }) => {
    const query = new URLSearchParams({ period: params.period });
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    return apiRequest<SalesReport>(`/api/reports/sales?${query.toString()}`);
  },
  importProducts: (payload: { csv: string; dryRun: boolean; onlyNames?: boolean }) =>
    apiRequest<ProductImportReport>('/api/products/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  restockInventory: (payload: { productId: string; quantity: number; reason: string }) =>
    apiRequest<{ success: boolean; newAvailableQuantity: number }>('/api/inventory/restock', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Customers & Credit (Fiado)
  /** `active: false` lists only the excluded customers (owner only). */
  listCustomers: (active?: boolean) =>
    apiRequest<{ items: CustomerItem[] }>(active === false ? '/api/customers?active=false' : '/api/customers'),
  searchCustomers: (query: string) =>
    apiRequest<{ items: CustomerItem[] }>(`/api/customers/search?q=${encodeURIComponent(query)}`),
  createCustomer: (payload: CreateCustomerPayload) =>
    apiRequest<CustomerItem>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCustomer: (id: string, patch: CustomerPatch) =>
    apiRequest<CustomerItem>(`/api/customers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getCustomerBalance: (customerId: string) =>
    apiRequest<CustomerBalance>(`/api/customers/${encodeURIComponent(customerId)}/balance`),
  getCustomerStatement: (customerId: string, limit: number, cursor?: string) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    return apiRequest<CustomerStatement>(`/api/customers/${encodeURIComponent(customerId)}/statement?${qs}`);
  },
  settleCustomerDebt: (
    customerId: string,
    payload: {
      amount: number | string;
      note?: string;
    }
  ) =>
    apiRequest<{
      movementId: string;
      customerId: string;
      type: string;
      amount: string;
      remainingDebt: string;
      cashSessionId: string;
      createdAt: string;
    }>(`/api/customers/${encodeURIComponent(customerId)}/settle`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getCreditMetrics: () =>
    apiRequest<CreditMetricsData>('/api/customers/metrics'),

  // Sales
  createSale: (payload: CreateSalePayload, idempotencyKey?: string) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest<SaleResponse>('/api/sales', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        idempotencyKey: idempotencyKey ?? payload.idempotencyKey,
      }),
    });
  },
  getSaleById: (saleId: string) =>
    apiRequest<SaleResponse>(`/api/sales/${encodeURIComponent(saleId)}`),
  getStoreSettings: () => apiRequest<StoreSettings>('/api/store/settings'),
  updateStoreSettings: (payload: StoreSettings) =>
    apiRequest<StoreSettings>('/api/store/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
  listRecentSales: () => apiRequest<{ items: RecentSaleItem[] }>('/api/sales/recent'),
  cancelSale: (saleId: string, payload: { ownerPin: string; reason: string }) =>
    apiRequest<{ success: boolean; sale: SaleResponse }>(
      `/api/sales/${encodeURIComponent(saleId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  // Operators
  listOperators: () =>
    apiRequest<{ items: OperatorItem[] }>('/api/users/operators'),
  createOperator: (payload: { username: string; password: string }) =>
    apiRequest<OperatorItem>('/api/users/operators', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

