import { join, relative } from 'node:path'
import type { Buffer } from 'node:buffer'
import process from 'node:process'
import fse from 'fs-extra'
import { mergePDFs } from '@condorhero/merge-pdfs'
import pc from 'picocolors'
import pdf from 'pdfjs'
import { convertPathToPosix } from './convertPathToPosix'

export interface NormalizePage {
  location: string
  pagePath: string
  url: string
  title?: string
}

function generateFileName(url: string) {
  const regex = /([^/]+)\.html$/;
  const matchResult = url.match(regex);
  if (matchResult && matchResult[1]) {
    let filename = matchResult[1];
    if (url.startsWith("/zhHans/")) {
      filename += "_zh.pdf";
    } else {
      filename += "_en.pdf";
    }
    return filename
  }

  return ""
}

/**
 * Merge PDFs.
 * @param pages - NormalizePage
 * @param outFile - Output file
 * @param outDir - Output directory
 * @returns relativePath - Output relative path
 */
export async function mergePDF(pages: NormalizePage[], outFile: string, outDir: string, pdfOutlines = true) {
  const saveDirPath = join(process.cwd(), outDir)
  outDir && fse.ensureDirSync(saveDirPath)
  const saveFilePath = join(saveDirPath, outFile)

  // 保存独立PDF文件的路径
  const independentPdfPaths: string[] = [];

  if (pages.length === 0) {
    process.stdout.write(pc.red('The website has no pages, please check whether the export path is set correctly'))
    process.exit(1)
  }
  else if (pages.length === 1) {
    fse.moveSync(pages[0].pagePath, saveFilePath, { overwrite: true })
    independentPdfPaths.push(saveFilePath);
  }
  else {
    let pdfData: Buffer
    if (pdfOutlines) {
      pdfData = await mergePDFs(pages.map(({ pagePath, url }) => {
        const relativePagePath = relative(process.cwd(), pagePath)

        const posixPagePath = convertPathToPosix(relativePagePath)

        const filename = generateFileName(url)

        // 保存每个页面的 PDF 文件
        const savePath = join(saveDirPath, filename);
        independentPdfPaths.push(savePath);
        fse.copySync(pagePath, savePath); // 复制单独的 PDF 文件
        independentPdfPaths.push(savePath);
        return posixPagePath;
      }))
    }
    else {
      const doc = new pdf.Document()
      // 对每个页面处理
      for (let i = 0; i < pages.length; i++) {
        const {
          pagePath,
          url
        } = pages[i];
        const pdfFileItem = fse.readFileSync(pagePath);
        const pageFile = new pdf.ExternalDocument(pdfFileItem);
        doc.addPagesOf(pageFile);

        const filename = generateFileName(url)

        // 保存每个页面的 PDF 文件
        const savePath = join(saveDirPath, filename);
        independentPdfPaths.push(savePath);
        fse.writeFileSync(savePath, pdfFileItem, {
          encoding: 'binary'
        });
      }

      pdfData = await doc.asBuffer()
    }

    fse.writeFileSync(saveFilePath, pdfData, { encoding: 'binary' })
  }

  return {
    mergedPdfPath: relative(process.cwd(), join(saveDirPath, outFile)),
    independentPdfPaths, // 返回所有单独生成的 PDF 路径
  };
}
