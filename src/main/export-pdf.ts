import { PDFDocument } from 'pdf-lib'

/** PDF user space tops out at 14400 units. Larger captures are scaled down to fit. */
const PDF_MAX_USER_UNIT = 14400

export async function pngToPdf(png: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(png)
  const scale = Math.min(1, PDF_MAX_USER_UNIT / image.width, PDF_MAX_USER_UNIT / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const page = pdf.addPage([width, height])
  page.drawImage(image, { x: 0, y: 0, width, height })
  return pdf.save()
}
