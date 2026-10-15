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
