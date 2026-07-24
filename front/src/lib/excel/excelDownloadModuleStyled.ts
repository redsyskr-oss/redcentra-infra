import * as XLSXJS from 'xlsx-js-style';

/** sms-front의 ExcelDownloadModuleStyled를 그대로 이식 — xlsx-js-style로
 * 헤더/행 배경색이 적용된 스타일 엑셀(단일/다중 시트)을 클라이언트에서 바로 생성해 다운로드한다. */
type LogLevel = 'info' | 'warn' | 'error' | 'success';

export type ExcelRow = Record<string, unknown>;

interface ExcelCellStyle {
  font?: { bold?: boolean; color?: { rgb: string }; sz?: number; name?: string };
  fill?: { fgColor?: { rgb: string } };
  alignment?: { horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'center' | 'bottom' };
  border?: {
    top?: { style: string; color?: { rgb: string } };
    bottom?: { style: string; color?: { rgb: string } };
    left?: { style: string; color?: { rgb: string } };
    right?: { style: string; color?: { rgb: string } };
  };
}

export interface ExcelSheetStyle {
  headerBg: string;
  headerColor: string;
  evenRowBg: string;
  oddRowBg: string;
}

interface ExcelFromDataOptions {
  data: ExcelRow[];
  fileName: string;
  fileType?: XLSXJS.BookType;
  sheetName?: string;
  headers?: string[];
  columnWidths?: { [column: string]: number };
  style?: ExcelSheetStyle;
}

class ExcelDownloadModuleStyled {
  private log(level: LogLevel, message: string, data?: unknown): void {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [Excel Module Styled]`;
    switch (level) {
      case 'info': console.log(`${prefix} ℹ️ ${message}`, data ?? ''); break;
      case 'warn': console.warn(`${prefix} ⚠️ ${message}`, data ?? ''); break;
      case 'error': console.error(`${prefix} ❌ ${message}`, data ?? ''); break;
      case 'success': console.log(`${prefix} ✅ ${message}`, data ?? ''); break;
    }
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
  }

  private getDefaultBorderStyle() {
    return {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    };
  }

  private getDefaultHeaderStyle(customStyle?: { headerBg: string; headerColor: string }): ExcelCellStyle {
    let bgColor = '4472C4';
    let textColor = 'FFFFFF';

    if (customStyle) {
      bgColor = customStyle.headerBg.replace('#', '').toUpperCase();
      if (bgColor.length !== 6 || !/^[0-9A-F]{6}$/i.test(bgColor)) bgColor = '4472C4';

      if (customStyle.headerColor === 'white') {
        textColor = 'FFFFFF';
      } else {
        textColor = customStyle.headerColor.replace('#', '').toUpperCase();
        if (textColor.length !== 6 || !/^[0-9A-F]{6}$/i.test(textColor)) textColor = 'FFFFFF';
      }
    }

    return {
      fill: { fgColor: { rgb: bgColor } },
      font: { bold: true, color: { rgb: textColor }, sz: 12, name: 'Arial' },
      border: this.getDefaultBorderStyle(),
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }

  private getDefaultDataStyle(): ExcelCellStyle {
    return {
      font: { sz: 11, name: 'Arial', color: { rgb: '000000' } },
      border: this.getDefaultBorderStyle(),
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }

  public downloadDataAsExcel({
    data, fileName, fileType = 'xlsx', sheetName = 'Sheet1', headers, columnWidths, style,
  }: ExcelFromDataOptions): boolean {
    try {
      if (!data || data.length === 0) {
        this.log('error', '다운로드할 데이터가 없습니다.');
        return false;
      }

      const sanitizedFileName = this.sanitizeFileName(fileName);
      const finalHeaders = headers ?? Object.keys(data[0]);
      const wsData: unknown[][] = [
        finalHeaders,
        ...data.map((row) => finalHeaders.map((header) => row[header] ?? '')),
      ];

      const ws = XLSXJS.utils.aoa_to_sheet(wsData);
      this.applyBasicStyling(ws, finalHeaders, wsData, style);
      if (columnWidths) this.setColumnWidths(ws, columnWidths);

      const wb = XLSXJS.utils.book_new();
      XLSXJS.utils.book_append_sheet(wb, ws, sheetName);
      // xlsx-js-style에서는 writeFile 사용 (writeFileXLSX 아님)
      XLSXJS.writeFile(wb, `${sanitizedFileName}.${fileType}`);

      this.log('success', '스타일 적용 데이터 엑셀 다운로드 완료', { fileName: sanitizedFileName, rowCount: data.length });
      return true;
    } catch (error) {
      this.log('error', '엑셀 다운로드 중 오류 발생', error);
      return false;
    }
  }

  public downloadMultiSheetExcel(
    sheets: Array<{ name: string; data: ExcelRow[]; headers?: string[] }>,
    fileName: string,
    style?: ExcelSheetStyle,
    fileType: XLSXJS.BookType = 'xlsx',
  ): boolean {
    try {
      const wb = XLSXJS.utils.book_new();

      sheets.forEach(({ name, data, headers }) => {
        if (data && data.length > 0) {
          const finalHeaders = headers ?? Object.keys(data[0]);
          const wsData: unknown[][] = [
            finalHeaders,
            ...data.map((row) => finalHeaders.map((header) => row[header] ?? '')),
          ];
          const ws = XLSXJS.utils.aoa_to_sheet(wsData);
          this.applyBasicStyling(ws, finalHeaders, wsData, style, true);
          XLSXJS.utils.book_append_sheet(wb, ws, name);
        }
      });

      const sanitizedFileName = this.sanitizeFileName(fileName);
      XLSXJS.writeFile(wb, `${sanitizedFileName}.${fileType}`);
      this.log('success', '스타일 적용 다중 시트 엑셀 다운로드 완료', { fileName: sanitizedFileName });
      return true;
    } catch (error) {
      this.log('error', '다중 시트 엑셀 다운로드 중 오류 발생', error);
      return false;
    }
  }

  private applyBasicStyling(
    ws: XLSXJS.WorkSheet,
    headers: string[],
    wsData: unknown[][],
    style?: ExcelSheetStyle,
    withAutofilter = false,
  ): void {
    const headerStyle = this.getDefaultHeaderStyle(style ? { headerBg: style.headerBg, headerColor: style.headerColor } : undefined);
    headers.forEach((_, colIdx) => {
      const addr = XLSXJS.utils.encode_cell({ r: 0, c: colIdx });
      if (ws[addr]) ws[addr].s = headerStyle;
    });

    const dataStyle = this.getDefaultDataStyle();
    let evenRowColor = 'F2F2F2';
    let oddRowColor = 'FFFFFF';
    if (style) {
      evenRowColor = style.evenRowBg.replace('#', '').toUpperCase();
      oddRowColor = style.oddRowBg.replace('#', '').toUpperCase();
      if (!/^[0-9A-F]{6}$/i.test(evenRowColor)) evenRowColor = 'F2F2F2';
      if (!/^[0-9A-F]{6}$/i.test(oddRowColor)) oddRowColor = 'FFFFFF';
    }

    for (let r = 1; r < wsData.length; r++) {
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSXJS.utils.encode_cell({ r, c });
        if (ws[addr]) {
          const rowStyle: ExcelCellStyle = { ...dataStyle, fill: { fgColor: { rgb: r % 2 === 0 ? evenRowColor : oddRowColor } } };
          ws[addr].s = rowStyle;
        }
      }
    }

    if (withAutofilter && ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

    const defaultWidths = headers.map((header, idx) => {
      const maxLength = Math.max(header.length, ...wsData.slice(1).map((row) => String(row[idx] ?? '').length));
      return Math.min(Math.max(maxLength * 1.2, 10), 50);
    });
    ws['!cols'] = defaultWidths.map((width) => ({ wch: width }));
  }

  private setColumnWidths(worksheet: XLSXJS.WorkSheet, columnWidths: { [column: string]: number }): void {
    worksheet['!cols'] = Object.keys(columnWidths).map((key) => ({ wch: columnWidths[key] }));
  }
}

const excelDownloaderStyled = new ExcelDownloadModuleStyled();
export default excelDownloaderStyled;
