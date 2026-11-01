export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  salePrice: number;
  availableQuantity: number;
  active?: boolean;
}

export interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  creditLimit?: number | string;
  active?: boolean;
  createdAt?: string;
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

export interface CreateSaleItem {
  productId: string;
  quantity: number;
}

export interface CreateSalePayment {
  method: 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD';
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

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let message = 'Falha ao processar solicitação.';
    let errors: Array<{ field: string; message: string }> | undefined;
    try {
      const data = await response.json();
      if (data.message) message = data.message;
      if (data.errors) errors = data.errors;
    } catch {
      // Body not JSON
    }
    throw new ApiError(response.status, message, errors);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  // Setup
  getSetupStatus: () => apiRequest<SetupStatus>('/api/setup/status'),
  setupOwner: (payload: { username: string; password: string; authorizationPin: string }) =>
    apiRequest<AuthUser>('/api/setup/owner', {
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

  // Products & Inventory
  findProductByBarcode: (barcode: string) =>
    apiRequest<ProductItem>(`/api/products/barcode/${encodeURIComponent(barcode)}`),
  searchProducts: (query: string) =>
    apiRequest<{ items: ProductItem[] }>(`/api/products/search?q=${encodeURIComponent(query)}`),
  listProducts: (query = '') =>
    apiRequest<{ items: ProductItem[] }>(`/api/products${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  createProduct: (payload: { barcode: string; name: string; salePrice: number | string; initialStock?: number }) =>
    apiRequest<ProductItem>('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        barcode: payload.barcode,
        name: payload.name,
        salePrice: payload.salePrice,
        initialStock: payload.initialStock ?? 0,
      }),
    }),
  restockInventory: (payload: { productId: string; quantity: number; reason: string }) =>
    apiRequest<{ success: boolean; newAvailableQuantity: number }>('/api/inventory/restock', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Customers & Credit (Fiado)
  listCustomers: () => apiRequest<{ items: CustomerItem[] }>('/api/customers'),
  searchCustomers: (query: string) =>
    apiRequest<{ items: CustomerItem[] }>(`/api/customers/search?q=${encodeURIComponent(query)}`),
  createCustomer: (payload: { name: string; phone: string; creditLimit?: number | string }) =>
    apiRequest<CustomerItem>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getCustomerBalance: (customerId: string) =>
    apiRequest<CustomerBalance>(`/api/customers/${encodeURIComponent(customerId)}/balance`),
  authorizeCreditSale: (
    customerId: string,
    payload: {
      saleAmount: number | string;
      ownerPin?: string;
      ownerUsername?: string;
      saleId?: string;
      note?: string;
    }
  ) =>
    apiRequest<{
      authorized: boolean;
      movementId: string;
      requiresOwnerPin: boolean;
      authorizedBy: string;
      saleAmount: string;
      customerId: string;
      createdAt: string;
    }>(`/api/customers/${encodeURIComponent(customerId)}/authorize-credit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
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

  // Operators
  listOperators: () =>
    apiRequest<{ items: OperatorItem[] }>('/api/users/operators'),
  createOperator: (payload: { username: string; password: string }) =>
    apiRequest<OperatorItem>('/api/users/operators', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

