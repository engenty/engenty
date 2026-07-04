import { createContext, type ReactNode, useContext } from "react";
import {
  downloadInvoicePdf,
  getInvoices,
  type InvoiceListItem,
  type InvoiceUpdateInput,
  updateInvoice,
} from "./api.js";

export interface InvoiceDataSource {
  downloadInvoicePdf(id: string, filename?: string): Promise<void>;
  getInvoices(signal?: AbortSignal): Promise<InvoiceListItem[]>;
  updateInvoice(
    id: string,
    patch: InvoiceUpdateInput
  ): Promise<InvoiceListItem>;
}

const InvoiceDataSourceContext = createContext<InvoiceDataSource | null>(null);

const defaultDataSource: InvoiceDataSource = {
  getInvoices,
  updateInvoice,
  downloadInvoicePdf,
};

export function InvoiceDataSourceProvider({
  dataSource = defaultDataSource,
  children,
}: {
  dataSource?: InvoiceDataSource;
  children: ReactNode;
}) {
  return (
    <InvoiceDataSourceContext.Provider value={dataSource}>
      {children}
    </InvoiceDataSourceContext.Provider>
  );
}

export function useInvoiceDataSource(): InvoiceDataSource {
  const ctx = useContext(InvoiceDataSourceContext);
  if (!ctx) {
    throw new Error("useInvoiceDataSource must be used within provider");
  }
  return ctx;
}
