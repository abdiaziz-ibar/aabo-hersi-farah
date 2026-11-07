import ExcelJS from 'exceljs';

/** Neutralise spreadsheet formulas (=, +, -, @, tab, CR) so Excel/Sheets never execute imported text. */
export function safeCell(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const csvCell = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return `"${String(safeCell(v)).replace(/"/g, '""')}"`;
};

/**
 * Send rows as CSV (UTF-8 with BOM so Excel reads it correctly) or XLSX.
 * columns: [{ header, key, width?, numeric? }]
 */
export async function sendTable(res, { format, filename, sheet = 'Data', columns, rows }) {
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheet.slice(0, 30));
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.numeric ? { numFmt: '#,##0.00' } : undefined }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    rows.forEach((r) => ws.addRow(Object.fromEntries(columns.map((c) => [c.key, safeCell(r[c.key])]))));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => (c.numeric && typeof r[c.key] === 'number' ? r[c.key].toFixed(2) : csvCell(r[c.key]))).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
}

export const TX_COLUMNS = [
  { header: 'Date', key: 'date', width: 20 },
  { header: 'Transaction ID', key: 'transaction_id', width: 22 },
  { header: 'Sender name', key: 'sender_name', width: 24 },
  { header: 'Sender phone', key: 'sender_phone', width: 16 },
  { header: 'Receiver name', key: 'receiver_name', width: 24 },
  { header: 'Receiver phone', key: 'receiver_phone', width: 16 },
  { header: 'Type', key: 'transaction_type', width: 11 },
  { header: 'Amount', key: 'amount', width: 14, numeric: true },
  { header: 'Currency', key: 'currency', width: 9 },
  { header: 'Source', key: 'source', width: 14 },
  { header: 'Reference', key: 'reference_number', width: 18 },
  { header: 'Description', key: 'description', width: 40 },
];

export const SOURCE_LABEL = { EVC_PLUS: 'EVC Plus', SALAAM_BANK: 'Salaam Bank' };

export const txRow = (t) => ({
  ...t,
  date: t.transaction_date.replace('T', ' ').slice(0, 19),
  source: SOURCE_LABEL[t.source] ?? t.source,
});
