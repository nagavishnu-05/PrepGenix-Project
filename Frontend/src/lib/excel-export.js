export async function downloadExcel(filename, rows, sheetName = "Report") {
    if (!rows.length) throw new Error("There are no rows to export.");

    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const headers = Object.keys(rows[0]);
    const sheetData = [
        headers.map((value) => ({ value, fontWeight: "bold" })),
        ...rows.map((row) => headers.map((header) => ({ value: row[header] ?? "" }))),
    ];
    const blob = await writeXlsxFile(sheetData, { sheet: sheetName.slice(0, 31) }).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
