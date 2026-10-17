const MAX_INVOICES = 1000;

function validInvoice(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.invoiceNo === 'string' && value.invoiceNo.trim().length > 0;
}

export function mergeInvoiceTrackerState(localInvoices, cloudInvoices) {
  const local = Array.isArray(localInvoices) ? localInvoices.filter(validInvoice) : [];
  const cloud = Array.isArray(cloudInvoices) ? cloudInvoices.filter(validInvoice) : [];
  const merged = new Map();
  for (const invoice of cloud) merged.set(invoice.id, invoice);
  // Local edits win for matching IDs; records unique to either source survive.
  for (const invoice of local) merged.set(invoice.id, invoice);
  return [...merged.values()].slice(-MAX_INVOICES);
}

const MAX_SALES_PACKAGES = 100;

function validSalesPackage(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.businessName === 'string' && value.businessName.trim().length > 0;
}

export function mergeSalesPackagesState(localPackages, cloudPackages) {
  const local = Array.isArray(localPackages) ? localPackages.filter(validSalesPackage) : [];
  const cloud = Array.isArray(cloudPackages) ? cloudPackages.filter(validSalesPackage) : [];
  const merged = new Map();
  for (const item of cloud) merged.set(item.id, item);
  for (const item of local) merged.set(item.id, item);
  return [...merged.values()].slice(-MAX_SALES_PACKAGES);
}

export function mergeDealTrackerState(localDeals, cloudDeals) {
  const local = localDeals && typeof localDeals === 'object' && !Array.isArray(localDeals) ? localDeals : {};
  const cloud = cloudDeals && typeof cloudDeals === 'object' && !Array.isArray(cloudDeals) ? cloudDeals : {};
  const merged = { ...cloud };
  for (const [id, value] of Object.entries(local)) {
    if (id && value && typeof value === 'object' && !Array.isArray(value)) merged[id] = value;
  }
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value)).slice(-1000));
}
