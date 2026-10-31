import { Customer } from './customer';

export interface CustomerRepository {
  save(customer: Customer): Promise<void>;
  findById(merchantId: string, customerId: string): Promise<Customer | null>;
  findByPhone(merchantId: string, phone: string): Promise<Customer | null>;
  findAllActive(merchantId: string): Promise<Customer[]>;
  search(merchantId: string, query: string): Promise<Customer[]>;
}
